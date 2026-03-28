"""
backend/local_vton_engine.py — Local GPU Virtual Try-On Engine
RTX 4050 ~6GB VRAM  |  Production-safe concurrency (semaphore)

Model: yisol/IDM-VTON (Hugging Face) — standard diffusers SDXL Inpaint bundle.
Inference uses luxury editorial prompts, negative prompts, 30-step diffusion,
post-process sharpening, and full + thumbnail JPEG outputs.
"""

import gc
import logging
import time
import io
import base64
import uuid
import threading
from pathlib import Path
from typing import Callable, Optional, Tuple

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter

from config import (
    GPU_MAX_CONCURRENT_RENDERS,
    RESULT_CACHE_DIR,
    RESULT_BASE_URL,
    VTON_MODEL_ID,
)

logger = logging.getLogger(__name__)
VTON_TARGET_SIZE: Tuple[int, int] = (768, 1024)

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

INFERENCE_STEPS = 30
GUIDANCE_SCALE = 7.5


class GPUBusyError(RuntimeError):
    pass


def _enhance_output(img: Image.Image) -> Image.Image:
    """Subtle sharpening and color grading for luxury presentation output."""
    img = img.filter(
        ImageFilter.UnsharpMask(radius=1.2, percent=115, threshold=3)
    )
    img = ImageEnhance.Contrast(img).enhance(1.06)
    img = ImageEnhance.Color(img).enhance(1.04)
    return img


def _save_result_to_disk(pil_image: Image.Image) -> Tuple[str, str]:
    """
    Save full-res JPEG and web thumbnail. Returns (full_url, thumb_url).
    """
    stem = uuid.uuid4().hex
    full_path = _RESULT_DIR / f"{stem}.jpg"
    pil_image.save(full_path, format="JPEG", quality=97, optimize=True)

    thumb = pil_image.copy()
    thumb.thumbnail((384, 512), Image.Resampling.LANCZOS)
    thumb_path = _RESULT_DIR / f"{stem}_thumb.jpg"
    thumb.save(thumb_path, format="JPEG", quality=85, optimize=True)

    url = f"{RESULT_BASE_URL}/{stem}.jpg"
    thumb_url = f"{RESULT_BASE_URL}/{stem}_thumb.jpg"
    logger.info(f"[VTON] Full: {url}")
    logger.info(f"[VTON] Thumb: {thumb_url}")
    return url, thumb_url


def _get_device() -> str:
    try:
        import torch
        if torch.cuda.is_available():
            props = torch.cuda.get_device_properties(0)
            vram_gb = props.total_memory / 1e9
            logger.info(f"[LOCAL_VTON] GPU: {props.name}  VRAM: {vram_gb:.1f}GB")
            return "cuda"
    except Exception:
        pass
    logger.warning("[LOCAL_VTON] No CUDA GPU — CPU inference (very slow).")
    return "cpu"


def _make_upper_body_mask(width: int, height: int) -> Image.Image:
    mask = Image.new("L", (width, height), 0)
    draw = ImageDraw.Draw(mask)
    draw.ellipse(
        [
            int(width * 0.12),
            int(height * 0.10),
            int(width * 0.88),
            int(height * 0.58),
        ],
        fill=255,
    )
    return mask


def _mask_to_rgb(mask_l: Image.Image) -> Image.Image:
    return mask_l.convert("RGB")


def _paste_garment_hint(
    person: Image.Image,
    garment: Image.Image,
    mask_l: Image.Image,
) -> Image.Image:
    w, h = person.size
    gw = max(64, int(w * 0.42))
    gh = max(64, int(h * 0.50))
    g = garment.resize((gw, gh), Image.Resampling.LANCZOS)
    x0 = (w - gw) // 2
    y0 = int(h * 0.13)
    layer = Image.new("RGB", (w, h))
    layer.paste(g, (x0, y0))
    m = mask_l.resize((w, h), Image.Resampling.LANCZOS)
    return Image.composite(layer, person, m)


def load_pipeline(progress_cb: Optional[Callable] = None):
    global _PIPELINE, _DEVICE

    if _PIPELINE is not None:
        return _PIPELINE

    _DEVICE = _get_device()

    if progress_cb:
        progress_cb(5, "Initializing GPU inference (IDM-VTON / SDXL Inpaint)...")

    try:
        import torch
        from diffusers import AutoPipelineForInpainting

        logger.info(
            f"[LOCAL_VTON] Loading {VTON_MODEL_ID} via AutoPipelineForInpainting (fp16)..."
        )
        t0 = time.time()

        if progress_cb:
            progress_cb(8, "Fetching weights from Hugging Face (cached after first run)...")

        pipe = AutoPipelineForInpainting.from_pretrained(
            VTON_MODEL_ID,
            torch_dtype=torch.float16,
            trust_remote_code=True,
            use_safetensors=False,
        )

        if _DEVICE == "cuda":
            try:
                pipe.enable_model_cpu_offload()
            except Exception:
                pipe = pipe.to("cuda")
            try:
                pipe.enable_attention_slicing(1)
                pipe.enable_vae_slicing()
                pipe.enable_vae_tiling()
            except Exception:
                pass
            try:
                pipe.enable_xformers_memory_efficient_attention()
                logger.info("[LOCAL_VTON] xformers memory-efficient attention enabled.")
            except Exception:
                logger.info("[LOCAL_VTON] xformers not available — default attention.")
        else:
            pipe = pipe.to("cpu")

        _PIPELINE = pipe
        elapsed = time.time() - t0
        logger.info(f"[LOCAL_VTON] Pipeline loaded in {elapsed:.1f}s (device strategy: {_DEVICE})")

        if progress_cb:
            progress_cb(12, "Neural engine ready.")

        return _PIPELINE

    except Exception as e:
        logger.error(f"[LOCAL_VTON] Pipeline load FAILED: {e}", exc_info=True)
        raise RuntimeError(f"VTON pipeline failed to initialize: {e!s}")


def run_local_tryon(
    person_image_b64: str,
    garment_image_b64: Optional[str],
    garment_category: str = "upperbody",
    n_steps: int = INFERENCE_STEPS,
    guidance_scale: float = GUIDANCE_SCALE,
    progress_cb: Optional[Callable] = None,
) -> Tuple[str, str]:
    acquired = _GPU_SEMAPHORE.acquire(blocking=False)
    if not acquired:
        depth = get_gpu_queue_depth()
        raise GPUBusyError(
            f"GPU is occupied ({depth} active renders). Estimated wait: ~{depth * 12}s."
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
    progress_cb: Optional[Callable],
) -> Tuple[str, str]:
    pipe = load_pipeline(progress_cb)

    if progress_cb:
        progress_cb(15, "Decoding person photo...")

    person_bytes = base64.b64decode(person_image_b64)
    person_img = Image.open(io.BytesIO(person_bytes)).convert("RGB").resize(VTON_TARGET_SIZE)

    garment_img: Optional[Image.Image] = None
    if garment_image_b64:
        garment_bytes = base64.b64decode(garment_image_b64)
        garment_img = Image.open(io.BytesIO(garment_bytes)).convert("RGB").resize(VTON_TARGET_SIZE)

    w, h = VTON_TARGET_SIZE
    mask_l = _make_upper_body_mask(w, h)

    if garment_img is not None:
        inpaint_src = _paste_garment_hint(person_img, garment_img, mask_l)
    else:
        inpaint_src = person_img

    mask_img = _mask_to_rgb(mask_l)

    import torch

    steps_eff = max(1, min(n_steps, 50))
    if progress_cb:
        progress_cb(25, f"Diffusion — {steps_eff} steps (SDXL Inpaint)...")

    step_increment = max(1.0, (85 - 25) / float(steps_eff))

    def _step_cb(step: int, timestep: int, latents: object) -> None:
        if progress_cb:
            pct = int(25 + min(step, steps_eff - 1) * step_increment)
            stage = (
                "Diffusing garment region..."
                if step < steps_eff // 3
                else "Refining drape and shadows..."
                if step < 2 * steps_eff // 3
                else "Texture and edge cleanup..."
            )
            progress_cb(pct, f"Step {step + 1}/{steps_eff} — {stage}")

    width, height = w, h

    gen_device = "cuda" if torch.cuda.is_available() else "cpu"
    generator = torch.Generator(device=gen_device).manual_seed(42)

    def _on_step_end(pipe, step_index, timestep, callback_kwargs):
        _step_cb(int(step_index), int(timestep) if timestep is not None else 0, None)
        return callback_kwargs

    with torch.inference_mode():
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
            try:
                free_gb = torch.cuda.mem_get_info()[0] / 1e9
                logger.info(f"[VTON] Free VRAM: {free_gb:.2f}GB")
            except Exception:
                pass

        call_base = dict(
            prompt=(
                "photorealistic luxury fashion photograph, "
                "professional studio lighting, "
                "high-end editorial quality, "
                "8K resolution, crisp fabric texture, "
                "clean white background, masterpiece"
            ),
            prompt_2=(
                "Vogue editorial, luxury maison, "
                "perfect drape, photorealistic fabric"
            ),
            negative_prompt=(
                "blurry, distorted, low quality, "
                "watermark, text overlay, deformed, "
                "bad anatomy, extra limbs, pixelated, "
                "compression artifacts, overexposed"
            ),
            negative_prompt_2=(
                "unrealistic, cartoon, painting, "
                "illustration, sketch, 3d render"
            ),
            image=inpaint_src,
            mask_image=mask_img,
            height=height,
            width=width,
            num_inference_steps=steps_eff,
            guidance_scale=guidance_scale,
            strength=0.99,
            generator=generator,
        )

        out = None
        try:
            out = pipe(**call_base, callback_on_step_end=_on_step_end)
        except TypeError:
            try:
                out = pipe(**call_base, callback=_step_cb, callback_steps=1)
            except TypeError:
                out = pipe(**call_base)

    result_img = out.images[0]
    result_img = _enhance_output(result_img)

    if progress_cb:
        progress_cb(90, "Saving render to cache...")
    url, thumb_url = _save_result_to_disk(result_img)
    if progress_cb:
        progress_cb(95, "Render ready.")

    return url, thumb_url


def get_gpu_stats() -> dict:
    try:
        import torch
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
                "vton_model_id": VTON_MODEL_ID,
            }
    except Exception:
        pass

    return {
        "gpu_available": False,
        "pipeline_loaded": _PIPELINE is not None,
        "active_renders": _ACTIVE_RENDERS,
        "reason": "CUDA not available or torch not installed",
        "vton_model_id": VTON_MODEL_ID,
    }
