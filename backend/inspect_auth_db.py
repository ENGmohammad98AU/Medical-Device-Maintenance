from app.database.connection import SessionLocal
from app.models.user import User
from app.security.password import verify_password

db = SessionLocal()
try:
    users = db.query(User).all()
    print('count=' + str(len(users)))
    for u in users:
        print('user=' + str((u.username, u.email, u.role.value if hasattr(u.role, 'value') else str(u.role), u.is_active)))
    admin = db.query(User).filter(User.username == 'admin').first()
    print('admin_exists=' + str(admin is not None))
    if admin:
        print('admin_email=' + admin.email)
        print('admin_hash=' + admin.hashed_password)
        print('verify_admin123=' + str(verify_password('admin123', admin.hashed_password)))
        print('verify_wrong=' + str(verify_password('wrongpass', admin.hashed_password)))
finally:
    db.close()
