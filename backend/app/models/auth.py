from datetime import date
from typing import Optional, List

from pydantic import BaseModel, EmailStr


class PetCreate(BaseModel):
    name: str
    species: Optional[str] = None
    breed: Optional[str] = None
    gender: Optional[str] = None        # M / F
    birth_date: Optional[date] = None
    weight_kg: Optional[float] = None
    height_cm: Optional[float] = None
    circumference: Optional[float] = None
    leg_length: Optional[float] = None


class SignupRequest(BaseModel):
    username: str
    email: EmailStr
    password: str
    nickname: Optional[str] = None
    pets: List[PetCreate] = []


class LoginRequest(BaseModel):
    username: str
    password: str


class SetCredentialsRequest(BaseModel):
    username: str
    password: str


class PetResponse(BaseModel):
    pet_id: int
    name: str
    species: Optional[str] = None
    breed: Optional[str] = None
    gender: Optional[str] = None
    birth_date: Optional[date] = None
    weight_kg: Optional[float] = None
    height_cm: Optional[float] = None
    circumference: Optional[float] = None
    leg_length: Optional[float] = None

    class Config:
        from_attributes = True


class UserResponse(BaseModel):
    user_id: int
    username: Optional[str] = None
    email: str
    nickname: Optional[str] = None
    oauth_provider: Optional[str] = None
    pets: List[PetResponse] = []

    class Config:
        from_attributes = True


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


class GoogleAuthRequest(BaseModel):
    email: EmailStr
    name: Optional[str] = None
    oauth_id: str
    picture: Optional[str] = None
    allow_create: bool = True  # 로그인은 False(기존 회원만), 회원가입 흐름은 True


class UpdateMeRequest(BaseModel):
    nickname: Optional[str] = None
    email: Optional[EmailStr] = None
