"""
User Service
"""

from sqlalchemy.orm import Session
from typing import Optional, List
from app.models.user import User, UserRole
from app.schemas.user import UserCreate, UserUpdate
from app.repositories.user import UserRepository
from app.security.password import verify_password


class UserService:
    """User service for business logic"""
    
    def __init__(self, db: Session):
        self.db = db
        self.repository = UserRepository(db)
    
    def create_user(self, user_data: UserCreate) -> User:
        """Create a new user"""
        # Check if email already exists
        if self.repository.get_by_email(user_data.email):
            raise ValueError("Email already registered")
        
        # Check if username already exists
        if self.repository.get_by_username(user_data.username):
            raise ValueError("Username already taken")
        
        return self.repository.create(user_data)
    
    def get_user(self, user_id: int) -> Optional[User]:
        """Get user by ID"""
        return self.repository.get_by_id(user_id)
    
    def get_user_by_email(self, email: str) -> Optional[User]:
        """Get user by email"""
        return self.repository.get_by_email(email)
    
    def get_user_by_username(self, username: str) -> Optional[User]:
        """Get user by username"""
        return self.repository.get_by_username(username)
    
    def get_all_users(self, skip: int = 0, limit: int = 100) -> List[User]:
        """Get all users"""
        return self.repository.get_all(skip, limit)
    
    def update_user(self, user_id: int, user_data: UserUpdate) -> Optional[User]:
        """Update user"""
        return self.repository.update(user_id, user_data)
    
    def delete_user(self, user_id: int) -> bool:
        """Delete user"""
        return self.repository.delete(user_id)
    
    def authenticate_user(self, username: str, password: str) -> Optional[User]:
        """Authenticate user with username or email and password"""
        if not username:
            return None

        identifier = username.strip()
        candidates = []

        if identifier:
            candidates.append(identifier)
            candidates.append(identifier.lower())
            candidates.append(identifier.upper())

        if "@" in identifier:
            email_candidates = [identifier.lower(), identifier]
            for email in email_candidates:
                user = self.repository.get_by_email(email)
                if user and verify_password(password, user.hashed_password):
                    return user

        for candidate in candidates:
            user = self.repository.get_by_username(candidate)
            if user and verify_password(password, user.hashed_password):
                return user

            user = self.repository.get_by_username(candidate.lower())
            if user and verify_password(password, user.hashed_password):
                return user

        return None
    
    def get_users_by_role(self, role: UserRole, skip: int = 0, limit: int = 100) -> List[User]:
        """Get users by role"""
        return self.repository.get_by_role(role, skip, limit)
