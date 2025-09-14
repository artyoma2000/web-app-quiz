import sqlite3
p='app.db'
conn=sqlite3.connect(p)
c=conn.cursor()
print('tables:')
for row in c.execute("SELECT name FROM sqlite_master WHERE type='table';"): print(' -',row[0])
print('\nadmin_users:')
for row in c.execute('SELECT id,username,password_hash FROM admin_users'): print(row)
print('\nquestions sample:')
for row in c.execute('SELECT id,question_text,correct_answer,options,quest_id FROM questions LIMIT 5'): print(row)
conn.close()
