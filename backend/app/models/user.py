"""
User Model
"""

from sqlalchemy import Column, Integer, String, Boolean, Enum
from app.database.base import Base, TimestampMixin
import enum


class UserRole(str, enum.Enum):
    """User roles"""
    BIOMEDICAL_ENGINEER = "biomedical_engineer"
    MEDICAL_TECHNICIAN = "medical_technician"
    DOCTOR = "doctor"
    NURSE = "nurse"
    ADMINISTRATOR = "administrator"


class User(Base, TimestampMixin):
    """User model"""
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    username = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    full_name = Column(String, nullable=False)
    role = Column(Enum(UserRole), default=UserRole.MEDICAL_TECHNICIAN, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    phone = Column(String, nullable=True)
    department = Column(String, nullable=True)
