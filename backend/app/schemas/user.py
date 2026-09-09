"""
User Schemas
"""

from pydantic import BaseModel, EmailStr, Field
from typing import Optional
from datetime import datetime
from app.models.user import UserRole


class UserBase(BaseModel):
    """Base user schema"""
    email: EmailStr
    username: str = Field(..., min_length=3, max_length=50)
    full_name: str = Field(..., min_length=2, max_length=100)
    role: UserRole = UserRole.MEDICAL_TECHNICIAN
    phone: Optional[str] = None
    department: Optional[str] = None


class UserCreate(UserBase):
    """User creation schema"""
    password: str = Field(..., min_length=8)


class UserUpdate(BaseModel):
    """User update schema"""
    full_name: Optional[str] = Field(None, min_length=2, max_length=100)
    phone: Optional[str] = None
    department: Optional[str] = None
    is_active: Optional[bool] = None


class UserInDB(UserBase):
    """User in database schema"""
    id: int
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class User(UserInDB):
    """User response schema"""
    pass


class Token(BaseModel):
    """Token schema"""
    access_token: str
    token_type: str = "bearer"


class TokenData(BaseModel):
    """Token data schema"""
    username: Optional[str] = None
    role: Optional[UserRole] = None
