import logging
from local_vton_engine import load_pipeline

logging.basicConfig(level=logging.INFO)

if __name__ == "__main__":
    print("Testing load_pipeline()...")
    pipe = load_pipeline()
    print("Pipeline loaded successfully!")
