"""
Run two try-on renders back-to-back (same process, warm pipeline) and report timings.

Usage (from backend/, venv active):
  $env:AIKART_API = "http://localhost:8001"
  python -u benchmark_two_renders.py
"""

from __future__ import annotations

import base64
import io
import os
import sys
import time

import requests
from dotenv import load_dotenv

load_dotenv()

try:
    from PIL import Image
except ImportError:
    Image = None  # type: ignore[misc, assignment]


def _make_test_photo_b64() -> str:
    from PIL import Image as PILImage

    img = PILImage.new("RGB", (256, 384), color=(210, 190, 170))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode()


def _poll_until_done(
    api: str, headers: dict[str, str], job_id: str, poll_s: float = 1.0
) -> dict:
    t0 = time.perf_counter()
    while True:
        r = requests.get(
            f"{api}/api/v1/tryon/status/{job_id}",
            headers=headers,
            timeout=30,
        )
        if r.status_code != 200:
            raise RuntimeError(f"status {r.status_code}: {r.text[:500]}")
        data = r.json()
        if data.get("status") in ("completed", "failed"):
            elapsed = time.perf_counter() - t0
            return {**data, "_poll_wall_s": elapsed}
        time.sleep(poll_s)


def _describe_image(url: str) -> str:
    if Image is None:
        return "PIL not available"
    try:
        r = requests.get(url, timeout=60)
        r.raise_for_status()
        img = Image.open(io.BytesIO(r.content)).convert("RGB")
        w, h = img.size
        extrema = img.getextrema()
        # Per-channel min/max spread
        spreads = [mx - mn for (mn, mx) in extrema]
        avg_spread = sum(spreads) / max(1, len(spreads))
        # Sample center vs edge brightness
        cx, cy = w // 2, h // 2
        px_c = img.getpixel((cx, cy))
        px_tl = img.getpixel((max(0, w // 8), max(0, h // 8)))
        parts = [
            f"{w}x{h}",
            f"channel_spread~{avg_spread:.1f}",
            f"center_rgb={px_c}",
            f"corner_rgb={px_tl}",
        ]
        if avg_spread < 8:
            parts.append("looks_flat_or_monochrome")
        elif avg_spread > 40:
            parts.append("good_contrast_variation")
        return "; ".join(parts)
    except Exception as e:
        return f"describe_failed: {e!s}"


def main() -> None:
    api = os.getenv("AIKART_API", "http://localhost:8001")
    print(f"[benchmark] AIKART_API={api}")

    import psycopg2

    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        print("DATABASE_URL missing", file=sys.stderr)
        sys.exit(1)
    conn = psycopg2.connect(db_url)
    cur = conn.cursor()
    cur.execute("SELECT id, api_key FROM brands WHERE name='Maison Luxe'")
    row = cur.fetchone()
    cur.close()
    conn.close()
    if not row:
        print("Maison Luxe brand not found", file=sys.stderr)
        sys.exit(1)
    brand_id, api_key = row[0], row[1]

    r = requests.post(
        f"{api}/api/v1/auth/token",
        json={"apiKey": api_key, "brandId": brand_id},
        timeout=15,
    )
    r.raise_for_status()
    token = r.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    r = requests.get(f"{api}/api/v1/catalog", headers=headers, timeout=15)
    r.raise_for_status()
    garments = r.json().get("garments", [])
    garment_id = garments[0]["id"] if garments else "ml_ls01"

    photo_b64 = _make_test_photo_b64()
    payload = {
        "userPhoto": photo_b64,
        "garmentId": garment_id,
        "includeRecommendation": False,
    }

    results: list[tuple[str, float, dict]] = []

    for label in ("first", "second"):
        t_submit = time.perf_counter()
        r = requests.post(
            f"{api}/api/v1/tryon/render",
            json=payload,
            headers=headers,
            timeout=30,
        )
        r.raise_for_status()
        job_id = r.json().get("jobId") or r.json().get("job_id")
        if not job_id:
            raise RuntimeError(f"No jobId in response: {r.json()}")
        job = _poll_until_done(api, headers, job_id)
        wall = time.perf_counter() - t_submit
        results.append((label, wall, job))
        print(
            f"[{label}] wall_clock_s={wall:.2f} status={job.get('status')} "
            f"imageUrl={job.get('imageUrl')}"
        )
        if job.get("status") != "completed":
            print(f"[{label}] FAILED detail: {job}", file=sys.stderr)
            sys.exit(1)

    first_s, second_s = results[0][1], results[1][1]
    print(f"\n=== SUMMARY ===")
    print(f"First render (cold-ish):  {first_s:.2f}s")
    print(f"Second render (warm):     {second_s:.2f}s")
    print(f"Delta (first - second):   {first_s - second_s:.2f}s")

    url = results[1][2].get("imageUrl") or results[0][2].get("imageUrl")
    if url:
        desc = _describe_image(url)
        print(f"\nLast result image quick analysis: {desc}")


if __name__ == "__main__":
    main()
