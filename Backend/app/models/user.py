from datetime import datetime
from typing import Optional
from pydantic import BaseModel, EmailStr, Field

class UserInDB(BaseModel):
    """
    User Model for the Database (MongoDB).
    This includes sensitive fields like 'hashed_password' that we 
    do NOT want to show in the API response.
    """
    id: Optional[str] = Field(None, alias="_id")
    username: str
    email: EmailStr
    client_id: Optional[str] = None
    hashed_password: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    # Optional: Profile fields for your specific chatbot logic
    description: Optional[str] = None         # Personality description

    class Config:
        # Allows accessing field by name or alias (e.g., user.id or user._id)
        populate_by_name = True
        json_encoders = {datetime: lambda v: v.isoformat()}