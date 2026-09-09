"""
Database Base Model
"""

from sqlalchemy import Column, DateTime
from sqlalchemy.orm import declarative_base
from datetime import datetime

Base = declarative_base()


class TimestampMixin:
    """Mixin for timestamp fields"""
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
