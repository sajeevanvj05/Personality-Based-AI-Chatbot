from uuid import uuid4

from app.utils.db import db
from app.utils.security import get_password_hash
from app.schemas.user import UserCreate
from app.models.user import UserInDB
from bson import ObjectId

async def get_user_by_username(username: str):
    """
    Retrieve a user from the database by their username.
    Returns a dictionary including the hashed_password.
    """
    if db.db is None:
        raise Exception("Database not connected")
        
    user = await db.db.users.find_one({"username": username})
    if user:
        # Convert ObjectId to string for easier handling
        user["_id"] = str(user["_id"])
    return user

async def create_user(user: UserCreate):
    """
    Create a new user in the database.
    1. Hashes the password.
    2. Creates a DB model instance (UserInDB).
    3. Saves to MongoDB.
    """
    if db.db is None:
        raise Exception("Database not connected")

    # 1. Hash the password
    hashed_pw = get_password_hash(user.password)
    client_id = uuid4().hex
    
    # 2. Create the DB Model instance
    # This automatically adds 'created_at' and validates structure
    db_user = UserInDB(
        username=user.username,
        email=user.email,
        client_id=client_id,
        hashed_password=hashed_pw
    )
    
    # 3. Convert to dict for MongoDB
    # by_alias=True ensures fields like 'id' are treated as '_id' if needed,
    # but for insertion, we exclude 'id' so MongoDB generates a fresh unique ObjectId.
    user_dict = db_user.dict(by_alias=True, exclude={"id"})
    
    # 4. Insert into Database
    result = await db.db.users.insert_one(user_dict)
    
    # 5. Return the response structure (ID + Data)
    return {
        "_id": str(result.inserted_id),
        "username": db_user.username,
        "email": db_user.email,
        "client_id": db_user.client_id,
    }