"""
backend/local_vton_engine.py
AI-Kart Virtual Try-On Engine
SDXL Inpainting — Production Grade
RTX 4050 6.44GB VRAM Optimized
"""

import base64
import gc
import io
import logging
import threading
import time
import uuid
from pathlib import Path
from typing import Callable, Optional, Tuple

import torch
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter

from config import (
    GPU_MAX_CONCURRENT_RENDERS,
    INFERENCE_STEPS,
    RESULT_BASE_URL,
    RESULT_CACHE_DIR,
    VTON_MODEL_ID,
)

logger = logging.getLogger(__name__)

GUIDANCE_SCALE = 7.5

TARGET_W, TARGET_H = 768, 1024

_GPU_SEMAPHORE = threading.Semaphore(GPU_MAX_CONCURRENT_RENDERS)
_ACTIVE_RENDERS = 0
_ACTIVE_RENDERS_LOCK = threading.Lock()


def _inc_active() -> int:
    global _ACTIVE_RENDERS
    with _ACTIVE_RENDERS_LOCK:
        _ACTIVE_RENDERS += 1
        return _ACTIVE_RENDERS


def _dec_active() -> int:
    global _ACTIVE_RENDERS
    with _ACTIVE_RENDERS_LOCK:
        _ACTIVE_RENDERS -= 1
        return _ACTIVE_RENDERS


def get_gpu_queue_depth() -> int:
    return _ACTIVE_RENDERS


_RESULT_DIR = Path(RESULT_CACHE_DIR)
_RESULT_DIR.mkdir(parents=True, exist_ok=True)

_PIPELINE = None
_DEVICE: Optional[str] = None


class GPUBusyError(RuntimeError):
    pass


def _get_device() -> str:
    try:
        if torch.cuda.is_available():
            props = torch.cuda.get_device_properties(0)
            vram_gb = props.total_memory / 1e9
            logger.info(
                f"[VTON] GPU: {props.name} | VRAM: {vram_gb:.1f}GB"
            )
            return "cuda"
    except Exception:
        pass
    logger.warning("[VTON] No CUDA GPU — using CPU (slow)")
    return "cpu"


def load_pipeline(progress_cb: Optional[Callable[[int, str], None]] = None):
    global _PIPELINE, _DEVICE

    if _PIPELINE is not None:
        logger.info("[VTON] Pipeline cache hit — reusing")
        return _PIPELINE

    _DEVICE = _get_device()

    try:
        from diffusers import AutoPipelineForInpainting

        if progress_cb:
            progress_cb(5, "Initializing SDXL neural engine...")

        logger.info(f"[VTON] Loading {VTON_MODEL_ID}...")
        t0 = time.time()

        pipe = AutoPipelineForInpainting.from_pretrained(
            VTON_MODEL_ID,
            torch_dtype=torch.float16,
            use_safetensors=True,
            variant="fp16",
        )

        if progress_cb:
            progress_cb(9, "Applying VRAM optimizations...")

        try:
            pipe.enable_model_cpu_offload()
            logger.info("[VTON] CPU offload enabled")
        except Exception as e:
            logger.warning(f"[VTON] CPU offload failed: {e}")
            pipe = pipe.to(_DEVICE)

        for opt_name, opt_fn in [
            ("attention_slicing", lambda: pipe.enable_attention_slicing(1)),
            ("vae_slicing", lambda: pipe.enable_vae_slicing()),
            ("vae_tiling", lambda: pipe.enable_vae_tiling()),
        ]:
            try:
                opt_fn()
                logger.info(f"[VTON] {opt_name} enabled")
            except Exception:
                pass

        try:
            pipe.enable_xformers_memory_efficient_attention()
            logger.info("[VTON] xformers enabled")
        except Exception:
            logger.info("[VTON] xformers not available")

        _PIPELINE = pipe

        # Warm CUDA allocator / kernels after load (does not run the full UNet).
        if _DEVICE == "cuda":
            try:
                dummy = torch.randn(
                    1,
                    4,
                    128,
                    96,
                    dtype=torch.float16,
                    device="cuda",
                )
                del dummy
                torch.cuda.empty_cache()
                logger.info("[VTON] GPU warmed up")
            except Exception as e:
                logger.warning("[VTON] GPU warm-up skipped: %s", e)

        elapsed = time.time() - t0
        logger.info(f"[VTON] Ready in {elapsed:.1f}s on {_DEVICE}")

        if progress_cb:
            progress_cb(12, "SDXL engine armed — RTX ready")

        return _PIPELINE

    except Exception as e:
        logger.error(f"[VTON] Pipeline load FAILED: {e}", exc_info=True)
        if progress_cb:
            progress_cb(0, f"Engine failed: {str(e)[:80]}")
        raise RuntimeError(f"VTON engine failed: {e!s}") from e


def _prepare_raw(
    b64: str,
    *,
    enhance_color: bool = False,
) -> Image.Image:
    raw = base64.b64decode(b64)
    img = Image.open(io.BytesIO(raw)).convert("RGB")

    tw, th = TARGET_W, TARGET_H
    w, h = img.size
    if w > 0 and h > 0 and (w / h) > (tw / th):
        new_w = int(h * tw / th)
        left = (w - new_w) // 2
        img = img.crop((left, 0, left + new_w, h))
    elif w > 0 and h > 0:
        new_h = int(w * th / tw)
        img = img.crop((0, 0, w, new_h))

    img = img.resize((tw, th), Image.Resampling.LANCZOS)
    img = ImageEnhance.Sharpness(img).enhance(1.05)
    img = ImageEnhance.Contrast(img).enhance(1.03)
    if enhance_color:
        img = ImageEnhance.Color(img).enhance(1.1)
    return img


def _preprocess_images(
    person_b64: str,
    garment_b64: Optional[str],
) -> Tuple[Image.Image, Optional[Image.Image]]:
    person_img = _prepare_raw(person_b64, enhance_color=False)
    garment_img = (
        _prepare_raw(garment_b64, enhance_color=True) if garment_b64 else None
    )
    return person_img, garment_img


def _create_garment_mask(person_img: Image.Image) -> Tuple[Image.Image, Image.Image]:
    """
    Upper-body inpaint region. Returns (mask RGB for diffusers, mask L for PIL paste).
    """
    w, h = person_img.size
    mask_l = Image.new("L", (w, h), 0)
    draw = ImageDraw.Draw(mask_l)
    x0 = int(w * 0.15)
    y0 = int(h * 0.15)
    x1 = int(w * 0.85)
    y1 = int(h * 0.75)
    draw.ellipse([x0, y0, x1, y1], fill=255)
    mask_rgb = mask_l.convert("RGB")
    return mask_rgb, mask_l


def _enhance_output(img: Image.Image) -> Image.Image:
    img = img.filter(
        ImageFilter.UnsharpMask(radius=1.2, percent=115, threshold=3)
    )
    img = ImageEnhance.Contrast(img).enhance(1.06)
    img = ImageEnhance.Color(img).enhance(1.04)
    return img


def _save_result_to_disk(pil_image: Image.Image) -> Tuple[str, str]:
    stem = uuid.uuid4().hex

    full_path = _RESULT_DIR / f"{stem}.jpg"
    pil_image.save(full_path, format="JPEG", quality=97, optimize=True)

    thumb = pil_image.copy()
    thumb.thumbnail((384, 512), Image.Resampling.LANCZOS)
    thumb_path = _RESULT_DIR / f"{stem}_thumb.jpg"
    thumb.save(thumb_path, format="JPEG", quality=85, optimize=True)

    url = f"{RESULT_BASE_URL}/{stem}.jpg"
    thumb_url = f"{RESULT_BASE_URL}/{stem}_thumb.jpg"

    logger.info(f"[VTON] Saved: {url}")
    return url, thumb_url


def run_local_tryon(
    person_image_b64: str,
    garment_image_b64: Optional[str],
    garment_category: str = "upperbody",
    n_steps: int = INFERENCE_STEPS,
    guidance_scale: float = GUIDANCE_SCALE,
    progress_cb: Optional[Callable[[int, str], None]] = None,
) -> Tuple[str, str]:
    acquired = _GPU_SEMAPHORE.acquire(blocking=False)
    if not acquired:
        depth = get_gpu_queue_depth()
        raise GPUBusyError(
            f"Neural Atelier occupied ({depth} active renders). "
            f"Estimated wait: ~{depth * 15}s."
        )

    _inc_active()
    try:
        return _do_inference(
            person_image_b64,
            garment_image_b64,
            garment_category,
            n_steps,
            guidance_scale,
            progress_cb,
        )
    finally:
        _GPU_SEMAPHORE.release()
        _dec_active()


def _do_inference(
    person_image_b64: str,
    garment_image_b64: Optional[str],
    _garment_category: str,
    n_steps: int,
    guidance_scale: float,
    progress_cb: Optional[Callable[[int, str], None]],
) -> Tuple[str, str]:
    pipe = load_pipeline(progress_cb)

    gc.collect()
    if _DEVICE == "cuda":
        torch.cuda.empty_cache()
        try:
            free_gb = torch.cuda.mem_get_info()[0] / 1e9
            logger.info(f"[VTON] Free VRAM: {free_gb:.2f}GB")
        except Exception:
            pass

    if progress_cb:
        progress_cb(15, "Preprocessing images...")

    person_img, garment_img = _preprocess_images(
        person_image_b64, garment_image_b64
    )
    mask_rgb, mask_l = _create_garment_mask(person_img)

    inpaint_src = person_img.copy()
    if garment_img is not None:
        inpaint_src.paste(garment_img, (0, 0), mask_l)

    if progress_cb:
        progress_cb(20, "Starting SDXL diffusion...")

    step_inc = (88 - 20) / max(1, n_steps)

    # diffusers may call with (pipeline, step, timestep, callback_kwargs)
    def _step_cb(
        _pipe: object,
        step: int,
        _timestep: int,
        callback_kwargs: dict,
    ) -> dict:
        if progress_cb:
            pct = int(20 + step * step_inc)
            stages = [
                "Diffusing cloth geometry...",
                "Baking volumetric shadows...",
                "Refining texture detail...",
            ]
            stage_idx = min(step * 3 // max(1, n_steps), len(stages) - 1)
            stage = stages[stage_idx]
            progress_cb(
                pct,
                f"Step {step + 1}/{n_steps} — {stage}",
            )
        return callback_kwargs

    # CPU generator avoids device mismatch with enable_model_cpu_offload()
    generator = torch.Generator(device="cpu").manual_seed(42)

    call_kwargs = dict(
        prompt=(
            "photorealistic luxury fashion photograph, "
            "professional studio lighting, "
            "high-end editorial quality, "
            "8K resolution, crisp fabric texture, "
            "clean background, masterpiece"
        ),
        prompt_2=(
            "Vogue editorial, luxury maison, "
            "perfect drape, photorealistic fabric"
        ),
        negative_prompt=(
            "blurry, distorted, low quality, "
            "watermark, text, deformed body, "
            "bad anatomy, extra limbs, "
            "pixelated, artifacts"
        ),
        negative_prompt_2=(
            "unrealistic, cartoon, painting, "
            "illustration, sketch, 3d render"
        ),
        image=inpaint_src,
        mask_image=mask_rgb,
        height=TARGET_H,
        width=TARGET_W,
        num_inference_steps=n_steps,
        guidance_scale=guidance_scale,
        strength=0.99,
        generator=generator,
    )

    with torch.inference_mode():
        output = pipe(**call_kwargs, callback_on_step_end=_step_cb)

    if progress_cb:
        progress_cb(90, "Enhancing output quality...")

    result_img = _enhance_output(output.images[0])

    if progress_cb:
        progress_cb(95, "Saving to result cache...")

    url, thumb_url = _save_result_to_disk(result_img)

    if progress_cb:
        progress_cb(98, "Render complete.")

    return url, thumb_url


def get_gpu_stats() -> dict:
    try:
        if torch.cuda.is_available():
            props = torch.cuda.get_device_properties(0)
            alloc = torch.cuda.memory_allocated(0)
            reserved = torch.cuda.memory_reserved(0)
            total = props.total_memory
            return {
                "gpu_available": True,
                "gpu_name": props.name,
                "vram_total_gb": round(total / 1e9, 2),
                "vram_used_gb": round(alloc / 1e9, 2),
                "vram_reserved_gb": round(reserved / 1e9, 2),
                "vram_free_gb": round((total - reserved) / 1e9, 2),
                "pipeline_loaded": _PIPELINE is not None,
                "active_renders": _ACTIVE_RENDERS,
                "max_concurrent": GPU_MAX_CONCURRENT_RENDERS,
                "model": VTON_MODEL_ID,
                "vton_model_id": VTON_MODEL_ID,
            }
    except Exception:
        pass
    return {
        "gpu_available": False,
        "pipeline_loaded": _PIPELINE is not None,
        "active_renders": _ACTIVE_RENDERS,
        "max_concurrent": GPU_MAX_CONCURRENT_RENDERS,
        "model": VTON_MODEL_ID,
        "vton_model_id": VTON_MODEL_ID,
    }