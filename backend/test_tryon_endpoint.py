import requests
import json
import base64

# Simulating the UI payload
data = {
    "userPhoto": "base64_encoded_dummy",
    "garmentId": "lowpoly_jacket",
    "includeRecommendation": True
}

try:
    print("Sending POST to /api/v1/tryon/render...")
    res = requests.post("http://localhost:8000/api/v1/tryon/render", json=data)
    print("Status Code:", res.status_code)
    print("Response JSON:", json.dumps(res.json(), indent=2))
except Exception as e:
    print("Error connecting to backend:", e)
