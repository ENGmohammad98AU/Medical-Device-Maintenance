"""
Application Configuration
"""

from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field, SecretStr
from typing import Optional
import os


class Settings(BaseSettings):
    """Application settings"""
    
    # App Info
    APP_NAME: str = "BioMed AI Assistant"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = True
    ENVIRONMENT: str = "development"
    
    # Database
    DATABASE_URL: str = "postgresql://postgres:password@localhost:5432/medical_ai_platform"
    SQLITE_FALLBACK: bool = True
    SQLITE_PATH: str = "./database/medical_ai.db"
    SEED_DEMO_DATA: bool = True
    BOOTSTRAP_ADMIN_USERNAME: Optional[str] = None
    BOOTSTRAP_ADMIN_PASSWORD: Optional[str] = None
    BOOTSTRAP_ADMIN_EMAIL: Optional[str] = None
    
    # JWT
    SECRET_KEY: str = "your-secret-key-change-this-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    
    # AI Configuration
    AI_MODE: str = "reference"  # reference (demo is a legacy alias), openai
    OPENAI_API_KEY: Optional[SecretStr] = None
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    LLM_MODEL: str = "gpt-4.1-mini-2025-04-14"
    LLM_TIMEOUT_SECONDS: float = Field(default=30.0, gt=0, le=60)
    TEMPERATURE: float = 0.7
    MAX_TOKENS: int = Field(default=1000, ge=128, le=4096)
    
    # RAG Configuration
    CHROMA_PERSIST_DIR: str = "./embeddings"
    CHUNK_SIZE: int = 500
    CHUNK_OVERLAP: int = 50
    EMBEDDING_MODEL: Optional[str] = None
    
    # File Upload
    MAX_UPLOAD_SIZE: int = 10485760  # 10MB
    ALLOWED_EXTENSIONS: str = "pdf,docx,png,jpg,jpeg"
    
    @property
    def allowed_extensions_list(self) -> list:
        """Parse ALLOWED_EXTENSIONS string to list"""
        return [ext.strip() for ext in self.ALLOWED_EXTENSIONS.split(",")]
    
    # CORS
    FRONTEND_URL: str = "http://localhost:5173"
    BACKEND_URL: str = "http://localhost:8000"
    ALLOWED_ORIGINS: list = ["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:5174", "http://127.0.0.1:5174", "http://127.0.0.1:55552", "http://localhost:55552"]
    
    # Logging
    LOG_LEVEL: str = "INFO"
    LOG_FILE: str = "./logs/app.log"
    
    model_config = SettingsConfigDict(env_file=".env", case_sensitive=True)


settings = Settings()
