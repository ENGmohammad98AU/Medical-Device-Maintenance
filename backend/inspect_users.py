import sqlite3
conn = sqlite3.connect(r'database\medical_ai.db')
print(conn.execute("select name from sqlite_master where type='table' order by name").fetchall())
print(conn.execute("select username,email from users order by username").fetchall())
conn.close()
