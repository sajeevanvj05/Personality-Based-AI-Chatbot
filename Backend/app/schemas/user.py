from pydantic import BaseModel, EmailStr, Field, constr


class UserCreate(BaseModel):
    username: str
    email: EmailStr
    password: constr(min_length=8, max_length=72)

class UserResponse(BaseModel):
    id: str = Field(alias="_id")
    username: str
    email: EmailStr
    client_id: str

class SignupResponse(BaseModel):
    message: str
    user: UserResponse

class Token(BaseModel):
    access_token: str
    token_type: str

class LoginResponse(Token):
    message: str
    client_id: str | None = None
    username: str | None = None