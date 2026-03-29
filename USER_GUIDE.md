# How To Test AI-Kart With Your Photo

## 1. Start the backend

```powershell
cd backend
.\venv\Scripts\Activate.ps1
uvicorn main:app --port 8001
```

Optional: set result URLs and inference steps (default is **15** steps for faster demos):

```powershell
$env:RESULT_BASE_URL = "http://localhost:8001/renders"
$env:INFERENCE_STEPS = "15"
```

## 2. Take a photo

- Stand in front of a **plain wall** (fewer distractions for the inpaint region).
- **Full upper body** visible (shoulders to hips works well with the current mask).
- **Even lighting**, no harsh backlight.
- Save as **JPEG or PNG** (e.g. `photo.jpg`).

## 3. Run the real-photo test script

From `backend/` with the venv active, `DATABASE_URL` in `.env` (or set `AIKART_BRAND_ID` + `AIKART_API_KEY`):

```powershell
$env:AIKART_API = "http://localhost:8001"
python test_real_photo.py C:\path\to\photo.jpg
```

The script prints progress, then **Full** and **Thumb** URLs when complete. It also writes the full image URL to `backend/last_render_url.txt`.

## 4. Open the result

Paste the **Full** URL into Chrome (or any browser) to inspect garment overlay quality.

## 5. Or use the product UI

1. Start the Next.js app: `cd aikart-app` then `npm run dev`.
2. Open [http://localhost:3000/try-on](http://localhost:3000/try-on).
3. Complete consent / profile steps as prompted.
4. Choose a garment and run **Execute Render**.

## 6. What to report

When sharing results with the team, include:

- The **full render URL** from the script or UI.
- **Photo conditions** (lighting, distance, plain background or not).
- Whether the **torso / garment region** looks plausible or needs prompt/mask tuning.

---

**Note:** Inference step count is controlled by `INFERENCE_STEPS` in `backend/config.py` (env override). Higher values (e.g. 20–25) can improve detail at the cost of slower renders.
