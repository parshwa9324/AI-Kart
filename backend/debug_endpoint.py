import asyncio
import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()

from main import render_virtual_tryon, TryOnRenderRequest

class DummyBG:
    def add_task(self, *a, **k):
        pass

class DummyDB:
    async def execute(self, q):
        class Result:
            def scalar_one_or_none(self):
                class Brand:
                    plan_tier = 'enterprise'
                    webhook_url = None
                return Brand()
        return Result()

def get_keys():
    conn = psycopg2.connect(os.getenv('DATABASE_URL'))
    cur = conn.cursor()
    cur.execute("SELECT id FROM brands WHERE name='Maison Luxe'")
    r = cur.fetchone()
    conn.close()
    return r[0] if r else None

async def test():
    brand_id = get_keys()
    if not brand_id:
        print("NO BRAND")
        return
    req = TryOnRenderRequest(
        userPhoto='dummy',
        garmentId='dummy',
        includeRecommendation=False
    )
    try:
        await render_virtual_tryon(req, DummyBG(), brand_id, DummyDB())
        print("SUCCESS!")
    except Exception as e:
        import traceback
        traceback.print_exc()

asyncio.run(test())
