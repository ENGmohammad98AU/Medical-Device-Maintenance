from app.database.connection import SessionLocal
from app.models.user import User
from app.security.password import verify_password

db = SessionLocal()

try:
    user = db.query(User).filter(User.username == "admin").first()

    print("User found:", user is not None)

    if user:
        print("Username:", user.username)
        print("Password check:", verify_password("admin123", user.hashed_password))
        print("Hashed password:", user.hashed_password)

finally:
    db.close()