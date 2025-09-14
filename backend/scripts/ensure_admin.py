from app.db import SessionLocal, pwd_context
from app.models import AdminUser

dbs = SessionLocal()
try:
    a = dbs.query(AdminUser).filter_by(username='admin').first()
    if a:
        print('admin exists')
    else:
        h = pwd_context.hash('admin')
        a = AdminUser(username='admin', password_hash=h)
        dbs.add(a)
        dbs.commit()
        print('admin created')
finally:
    dbs.close()
