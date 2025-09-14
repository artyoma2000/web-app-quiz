import os, json
from urllib.parse import quote_plus

ROOT = os.path.abspath(os.path.dirname(__file__))
CFG_PATH = os.path.join(ROOT, 'config.json')
cfg = {}
if os.path.exists(CFG_PATH):
    cfg = json.load(open(CFG_PATH, 'r', encoding='utf-8'))
pg = cfg.get('postgres', {})
user = os.environ.get('POSTGRES_USER') or pg.get('user') or 'postgres'
pw = os.environ.get('POSTGRES_PASSWORD') or pg.get('password') or 'postgres'
host = os.environ.get('POSTGRES_HOST') or pg.get('host') or 'localhost'
port = os.environ.get('POSTGRES_PORT') or pg.get('port') or 5432
name = os.environ.get('POSTGRES_DB') or pg.get('db') or 'appdb'
user_q = quote_plus(str(user))
pw_q = quote_plus(str(pw))
dsn = f"postgresql+psycopg2://{user_q}:{pw_q}@{host}:{port}/{name}"
print('DSN:', dsn)

try:
    import psycopg2
    print('psycopg2 version:', getattr(psycopg2, '__version__', None))
    # try raw connect
    try:
        conn = psycopg2.connect(user=user, password=pw, host=host, port=port, dbname=name)
        print('Connected OK (raw psycopg2)')
        conn.close()
    except Exception as e:
        print('Raw connect failed:', type(e), e)
        import traceback
        traceback.print_exc()
except Exception as e:
    print('psycopg2 import failed:', e)
    import traceback
    traceback.print_exc()
