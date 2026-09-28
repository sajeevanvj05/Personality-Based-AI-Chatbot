from motor.motor_asyncio import AsyncIOMotorClient
from typing import Any
import os

# In production, load this from .env
MONGODB_URL = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
DB_NAME = os.getenv("DB_NAME", "ai_clone_db")

class Database:
    client: Any = None
    db = None

db = Database()

async def connect_to_mongo():
    db.client = AsyncIOMotorClient(MONGODB_URL)
    db.db = db.client[DB_NAME]
    print("Connected to MongoDB")

async def close_mongo_connection():
    # Safely close only if a client was initialized
    if db.client:
        db.client.close()
        db.client = None
        db.db = None
        print("Closed MongoDB connection")