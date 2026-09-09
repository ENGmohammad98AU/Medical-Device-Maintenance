"""
Logging Configuration
"""

import logging
import sys
from pathlib import Path
from app.core.config import settings


def setup_logging():
    """Setup application logging"""
    
    # Create logs directory if it doesn't exist
    log_dir = Path(settings.LOG_FILE).parent
    log_dir.mkdir(parents=True, exist_ok=True)
    
    # Configure logging
    logging.basicConfig(
        level=getattr(logging, settings.LOG_LEVEL),
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        handlers=[
            logging.StreamHandler(sys.stdout),
            logging.FileHandler(settings.LOG_FILE)
        ]
    )
