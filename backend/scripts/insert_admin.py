from passlib.context import CryptContext
import sqlite3
pwd = CryptContext(schemes=['bcrypt'], deprecated='auto')
h = pwd.hash('admin')
print('hash len', len(h))
conn=sqlite3.connect('app.db')
cur=conn.cursor()
cur.execute("INSERT INTO admin_users (username,password_hash) VALUES (?,?)",('admin',h))
conn.commit()
print('inserted')
for row in cur.execute('select id,username from admin_users'): print(row)
conn.close()
