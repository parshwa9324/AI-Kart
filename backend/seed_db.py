"""
backend/seed_db.py — AI-Kart Database Seeder
Seeds the PostgreSQL database with canonical brands and their digitized garment catalogs.
"""

import asyncio
from database import AsyncSessionLocal, engine, Base
from models import Brand, Garment

async def seed_database():
    # 1. Create all tables if they don't exist
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with AsyncSessionLocal() as session:
        # Clear existing
        # CAUTION: In production, do not run seed_db blindly or clear tables.
        
        # 2. Define the brands
        brands_data = [
            {
                "name": "Maison Luxe",
                "api_key": "ml_sandbox_5x9a",
                "plan_tier": "enterprise",
                "garments": [
                    {
                        "name": "Cotton Classic Crew",
                        "type": "upper_body",
                        "material_code": "cotton",
                        "stretch_coefficient": 0.02
                    },
                    {
                        "name": "Cashmere Touring Sweater",
                        "type": "upper_body",
                        "material_code": "cashmere",
                        "stretch_coefficient": 0.08
                    },
                    {
                        "name": "Performance Elastane Tee",
                        "type": "upper_body",
                        "material_code": "elastane",
                        "stretch_coefficient": 0.35
                    }
                ]
            },
            {
                "name": "Zegna",
                "api_key": "zg_test_9p2l",
                "plan_tier": "enterprise",
                "garments": [
                    {
                        "name": "Oasi Cashmere Overshirt",
                        "type": "upper_body",
                        "material_code": "cashmere",
                        "stretch_coefficient": 0.08
                    },
                    {
                        "name": "Trofeo Wool Blazer",
                        "type": "upper_body",
                        "material_code": "wool",
                        "stretch_coefficient": 0.05
                    },
                    {
                        "name": "Cotton Jersey Polo",
                        "type": "upper_body",
                        "material_code": "cotton",
                        "stretch_coefficient": 0.02
                    }
                ]
            },
            {
                "name": "Prada",
                "api_key": "pr_dev_7x4k",
                "plan_tier": "enterprise",
                "garments": [
                    {
                        "name": "Re-Nylon Gabardine Jacket",
                        "type": "upper_body",
                        "material_code": "synthetic",
                        "stretch_coefficient": 0.01
                    },
                    {
                        "name": "Worsted Wool Suit Jacket",
                        "type": "upper_body",
                        "material_code": "wool",
                        "stretch_coefficient": 0.05
                    },
                    {
                        "name": "Cotton Poplin Shirt",
                        "type": "upper_body",
                        "material_code": "cotton",
                        "stretch_coefficient": 0.02
                    }
                ]
            }
        ]

        print("Seeding database...")

        for b_data in brands_data:
            garment_data = b_data.pop("garments")
            brand = Brand(**b_data)
            session.add(brand)
            await session.flush() # flush to get brand.id
            
            for g_data in garment_data:
                garment = Garment(brand_id=brand.id, **g_data)
                session.add(garment)

        await session.commit()
        print("Database seeding complete. 3 Brands and 9 Garments injected.")

if __name__ == "__main__":
    asyncio.run(seed_database())
