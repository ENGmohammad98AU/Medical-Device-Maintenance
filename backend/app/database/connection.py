"""
Database Connection Configuration
"""

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
import sqlite3
from pathlib import Path
from app.core.config import settings

# Try PostgreSQL first, fallback to SQLite
engine = None
SessionLocal = None

try:
    # Try PostgreSQL. SQLAlchemy 2 + psycopg 3 uses the explicit driver name.
    database_url = settings.DATABASE_URL
    if database_url.startswith("postgresql://"):
        database_url = database_url.replace("postgresql://", "postgresql+psycopg://", 1)
    engine = create_engine(
        database_url,
        pool_pre_ping=True,
        echo=settings.DEBUG
    )
    # Test connection
    with engine.connect() as conn:
        conn.execute(text("SELECT 1"))
    print("Connected to PostgreSQL")
except Exception as e:
    print(f"PostgreSQL connection failed: {e}")
    if settings.SQLITE_FALLBACK:
        # Fallback to SQLite
        sqlite_path = Path(settings.SQLITE_PATH)
        sqlite_path.parent.mkdir(parents=True, exist_ok=True)
        
        engine = create_engine(
            f"sqlite:///{settings.SQLITE_PATH}",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
            echo=settings.DEBUG
        )
        print(f"Using SQLite fallback: {settings.SQLITE_PATH}")
    else:
        raise e

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db():
    """Database session dependency"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
