"""
Submit a real JPEG/PNG from disk to the try-on pipeline and poll until completion.

Credentials: reads Maison Luxe brand from PostgreSQL (DATABASE_URL), same as e2e tests.
Override with env: AIKART_BRAND_ID, AIKART_API_KEY

Usage (from backend/, venv active):
  $env:AIKART_API = "http://localhost:8001"
  python test_real_photo.py C:\\path\\to\\photo.jpg
"""

from __future__ import annotations

import base64
import os
import sys
import time

import requests
from dotenv import load_dotenv

load_dotenv()

API = os.getenv("AIKART_API", "http://localhost:8001")


def _credentials() -> tuple[str, str]:
    brand_id = os.getenv("AIKART_BRAND_ID")
    api_key = os.getenv("AIKART_API_KEY")
    if brand_id and api_key:
        return brand_id, api_key
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        print(
            "Set DATABASE_URL or AIKART_BRAND_ID + AIKART_API_KEY",
            file=sys.stderr,
        )
        sys.exit(1)
    import psycopg2

    conn = psycopg2.connect(db_url)
    cur = conn.cursor()
    cur.execute("SELECT id, api_key FROM brands WHERE name='Maison Luxe'")
    row = cur.fetchone()
    cur.close()
    conn.close()
    if not row:
        print("Maison Luxe brand not found in DB.", file=sys.stderr)
        sys.exit(1)
    return str(row[0]), str(row[1])


def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: python test_real_photo.py <path_to_photo.jpg>")
        print("Example: python test_real_photo.py C:\\Users\\Parshwa\\photo.jpg")
        sys.exit(1)

    photo_path = sys.argv[1]
    if not os.path.isfile(photo_path):
        print(f"Photo not found: {photo_path}")
        sys.exit(1)

    with open(photo_path, "rb") as f:
        photo_b64 = base64.b64encode(f.read()).decode()
    print(f"Photo loaded: {os.path.getsize(photo_path) / 1024:.1f} KB")

    brand_id, api_key = _credentials()

    r = requests.post(
        f"{API}/api/v1/auth/token",
        json={"apiKey": api_key, "brandId": brand_id},
        timeout=15,
    )
    if r.status_code != 200:
        print(f"Auth failed HTTP {r.status_code}: {r.text[:500]}", file=sys.stderr)
        sys.exit(1)
    token = r.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    r = requests.get(f"{API}/api/v1/catalog", headers=headers, timeout=15)
    if r.status_code != 200:
        print(f"Catalog failed: {r.text[:300]}", file=sys.stderr)
        sys.exit(1)
    garments = r.json().get("garments") or []
    if not garments:
        print("No garments in catalog.", file=sys.stderr)
        sys.exit(1)

    print("Available garments:")
    for i, g in enumerate(garments):
        print(f"  {i}: {g.get('name', '?')}")
    garment_id = garments[0]["id"]
    print(f"Using: {garments[0].get('name', garment_id)}")

    print("Submitting render...")
    r = requests.post(
        f"{API}/api/v1/tryon/render",
        json={"userPhoto": photo_b64, "garmentId": garment_id},
        headers=headers,
        timeout=30,
    )
    if r.status_code != 200:
        print(f"Render submit failed: {r.text[:500]}", file=sys.stderr)
        sys.exit(1)
    job_id = r.json().get("jobId")
    if not job_id:
        print(f"No jobId in response: {r.json()}", file=sys.stderr)
        sys.exit(1)
    print(f"Job ID: {job_id}")

    start = time.time()
    for i in range(200):
        time.sleep(3)
        r = requests.get(
            f"{API}/api/v1/tryon/status/{job_id}",
            headers=headers,
            timeout=30,
        )
        if r.status_code != 200:
            print(f"Status HTTP {r.status_code}: {r.text[:200]}")
            continue
        d = r.json()
        elapsed = time.time() - start
        pct = int(d.get("progressPct") or 0)
        detail = (d.get("progressDetail") or "").replace("\n", " ")
        filled = min(20, max(0, pct // 5))
        bar = "#" * filled + "-" * (20 - filled)
        print(f"[{elapsed:5.0f}s] [{bar}] {pct:3d}% {detail}")

        if d.get("status") == "completed":
            url = d.get("imageUrl")
            thumb = d.get("thumbUrl")
            print(f"\nCOMPLETED in {elapsed:.0f}s")
            print(f"Full:  {url}")
            print(f"Thumb: {thumb}")
            out_path = os.path.join(os.path.dirname(__file__), "last_render_url.txt")
            if url:
                with open(out_path, "w", encoding="utf-8") as f:
                    f.write(url)
                print(f"URL saved to {out_path}")
            break
        if d.get("status") == "failed":
            print(f"FAILED: {d.get('error')}")
            break
    else:
        print("Timed out waiting for job (200 * 3s).")


if __name__ == "__main__":
    main()
