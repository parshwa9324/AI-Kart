import requests
import json
import base64
import time
import sys
import io
import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()
DB_URL = os.getenv('DATABASE_URL')

def get_credentials():
    try:
        conn = psycopg2.connect(DB_URL)
        cur = conn.cursor()
        cur.execute("SELECT id, api_key FROM brands WHERE name='Maison Luxe'")
        row = cur.fetchone()
        cur.close()
        conn.close()
        return row[0], row[1] if row else (None, None)
    except Exception as e:
        print(f"DB Error: {e}")
        return None, None

brand_id, api_key = get_credentials()
if not brand_id:
    print('Failed to find Maison Luxe in DB')
    sys.exit(1)

API = os.getenv('AIKART_API', 'http://localhost:8001')

# Step 1: Get JWT
print('[1] Getting JWT token...')
r = requests.post(
    f'{API}/api/v1/auth/token',
    json={'apiKey': api_key, 'brandId': brand_id},
    timeout=10
)
print(f'    HTTP {r.status_code}')
print(f'    Body: {r.text[:300]}')
if r.status_code != 200:
    print('AUTH FAILED — cannot continue')
    sys.exit(1)

token = r.json()['access_token']
print(f'    JWT: {token[:60]}...')
headers = {'Authorization': f'Bearer {token}'}

# Step 2: Get first garment from catalog
print('[2] Fetching Maison Luxe garment catalog...')
# Live route is GET /api/v1/catalog (not .../catalog/garments)
r = requests.get(f'{API}/api/v1/catalog', headers=headers, timeout=10)
print(f'    HTTP {r.status_code}')
if r.status_code == 200:
    garments = r.json().get('garments', [])
    print(f'    Garments found: {len(garments)}')
    if garments:
        garment_id = garments[0].get('id') or garments[0].get('garment_id', 'ml_ls01')
        garment_name = garments[0].get('name', '')
        print(f'    Using garment: [{garment_id}] {garment_name}')
    else:
        garment_id = 'ml_ls01'
        print(f'    Empty catalog — using fallback: {garment_id}')
else:
    garment_id = 'ml_ls01'
    print(f'    Catalog unavailable — using fallback: {garment_id}')

# Step 3: Create test body silhouette image
print('[3] Creating test person image (256x384 PNG)...')
try:
    from PIL import Image
    img = Image.new('RGB', (256, 384), color=(210, 190, 170))
    buf = io.BytesIO()
    img.save(buf, format='PNG')
    photo_b64 = base64.b64encode(buf.getvalue()).decode()
except Exception as e:
    # Fallback: create a raw PNG manually
    import struct
    import zlib
    def create_minimal_png(w, h):
        def chunk(name, data):
            c = struct.pack('>I', len(data)) + name + data
            return c + struct.pack('>I', zlib.crc32(c[4:]) & 0xffffffff)
        png = b'\x89PNG\r\n\x1a\n'
        png += chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0))
        raw = b''.join(b'\x00' + b'\xd2\xbe\xaa' * w for _ in range(h))
        png += chunk(b'IDAT', zlib.compress(raw))
        png += chunk(b'IEND', b'')
        return png
    photo_b64 = base64.b64encode(create_minimal_png(256, 384)).decode()
print(f'    Image encoded: {len(photo_b64)} base64 chars')

# Step 4: Submit render job
print('[4] Submitting render job to POST /api/v1/tryon/render...')
payload = {
    'userPhoto': photo_b64,
    'garmentId': garment_id,
    'includeRecommendation': True,
}
r = requests.post(
    f'{API}/api/v1/tryon/render',
    json=payload,
    headers=headers,
    timeout=20
)
print(f'    HTTP {r.status_code}')
print(f'    Response: {r.text[:500]}')
if r.status_code != 200:
    print('RENDER SUBMIT FAILED')
    sys.exit(1)

data = r.json()
job_id = data.get('jobId')
print(f'    Job ID: {job_id}')
print(f'    Initial status: {data.get("status")}')

# Step 5: Poll every 3 seconds
print('[5] Polling GET /api/v1/tryon/status/{job_id} every 3s...')
result_url = None
# Cold start: model deserialize + VRAM — allow up to 10 minutes polling
for i in range(200):
    time.sleep(3)
    if i == 60:
        print('     [3 min] Model still loading...')
        print('     [INFO] SDXL models take 3-5 min')
        print('     [INFO] Subsequent renders: ~15s')
    try:
        r = requests.get(
            f'{API}/api/v1/tryon/status/{job_id}',
            headers=headers,
            timeout=10
        )
        sd = r.json()
    except Exception as e:
        print(f'    [{i+1:02d}] poll error: {e}')
        continue

    status = sd.get('status', '?')
    pct = sd.get('progressPct', 0)
    detail = sd.get('progressDetail', '')
    elapsed = (i + 1) * 3
    print(f'    [{i+1:02d}] {elapsed:3d}s | status={status:<12} | pct={pct:3}% | {detail}')

    if status == 'completed':
        result_url = sd.get('imageUrl', '')
        print('')
        print('=' * 60)
        print('[6] SUCCESS! Render COMPLETED.')
        print(f'    result_url = {result_url}')
        print('=' * 60)
        with open('result_url.txt', 'w') as f:
            f.write(result_url or '')
        break
    elif status == 'failed':
        print(f'    ERROR: {sd.get("error", "unknown")}')
        sys.exit(1)

if not result_url:
    print('[TIMEOUT] Job did not complete within polling window (200 × 3s = 600s).')
    # Show last known status
    r = requests.get(f'{API}/api/v1/tryon/status/{job_id}', headers=headers, timeout=10)
    print(f'Final status: {r.text[:300]}')
    sys.exit(1)

print(f'\n[7] Opening result URL in browser...')
print(f'    URL: {result_url}')
