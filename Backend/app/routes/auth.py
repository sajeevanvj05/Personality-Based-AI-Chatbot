from fastapi import APIRouter, Depends, HTTPException, status, Body
from app.schemas.user import UserCreate, UserResponse, Token, SignupResponse, LoginResponse
from app.crud.user import create_user, get_user_by_username
from app.utils.security import verify_password, create_access_token
from pydantic import BaseModel

router = APIRouter(prefix="/auth", tags=["Authentication"])

class LoginRequest(BaseModel):
    username: str
    password: str

@router.post("/signup", response_model=SignupResponse, status_code=status.HTTP_201_CREATED)
async def signup(user: UserCreate):
    existing_user = await get_user_by_username(user.username)
    if existing_user:
        raise HTTPException(status_code=400, detail="Username already registered")
    created_user = await create_user(user)
    return {"message": "User created successfully", "user": created_user}

@router.post("/login", response_model=LoginResponse)
async def login(login_data: LoginRequest = Body(..., description="Username/password to obtain an access token")):
    user = await get_user_by_username(login_data.username)
    if not user or not verify_password(login_data.password, user["hashed_password"]):
        raise HTTPException(status_code=400, detail="Incorrect username or password")
    
    access_token = create_access_token(data={"sub": user["username"]})
    return {
        "message": "Login successful",
        "access_token": access_token,
        "token_type": "bearer",
        "client_id": user.get("client_id"),
        "username": user.get("username"),
    }