import os
import json
from datetime import datetime
import time
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.exc import SQLAlchemyError, OperationalError
from .models import Base, AdminUser, Question, GameState
from passlib.context import CryptContext
from urllib.parse import quote_plus

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Read configuration (config.json) or fall back to environment variables
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
CONFIG_PATH = os.path.join(ROOT, 'config.json')

def load_config():
    cfg = {}
    if os.path.exists(CONFIG_PATH):
        try:
            with open(CONFIG_PATH, 'r', encoding='utf-8') as f:
                cfg = json.load(f)
        except Exception:
            cfg = {}
    # allow env overrides
    db_url = os.environ.get('DATABASE_URL') or cfg.get('database_url')
    if not db_url and cfg.get('postgres'):
        pg = cfg['postgres']
        user = os.environ.get('POSTGRES_USER') or pg.get('user') or 'postgres'
        pw = os.environ.get('POSTGRES_PASSWORD') or pg.get('password') or 'postgres'
        host = os.environ.get('POSTGRES_HOST') or pg.get('host') or 'localhost'
        port = os.environ.get('POSTGRES_PORT') or pg.get('port') or 5432
        name = os.environ.get('POSTGRES_DB') or pg.get('db') or 'appdb'
        # URL-encode username and password to avoid invalid bytes in DSN
        user_q = quote_plus(str(user))
        pw_q = quote_plus(str(pw))
        db_url = f"postgresql+psycopg2://{user_q}:{pw_q}@{host}:{port}/{name}"
    return {
        'database_url': db_url,
        'create_tables': bool(os.environ.get('CREATE_TABLES') or cfg.get('create_tables'))
    }


CFG = load_config()

if CFG['database_url']:
    # try to use Postgres; if driver missing or connection fails, fall back to sqlite
    try:
        engine = create_engine(CFG['database_url'], pool_pre_ping=True)
    except Exception as e:
        print('Could not create Postgres engine:', e)
        print('Falling back to local SQLite database.')
        DB_FILE = os.path.join(ROOT, 'app.db')
        DB_PATH = os.path.abspath(DB_FILE)
        engine = create_engine(f"sqlite:///{DB_PATH}", connect_args={"check_same_thread": False})
else:
    # fallback to local sqlite
    DB_FILE = os.path.join(ROOT, 'app.db')
    DB_PATH = os.path.abspath(DB_FILE)
    engine = create_engine(f"sqlite:///{DB_PATH}", connect_args={"check_same_thread": False})

SessionLocal = sessionmaker(bind=engine)


def init_database():
    """Initialize the database and optionally create tables."""
    db = None
    attempts = 0
    max_attempts = 12
    wait_seconds = 2
    while attempts < max_attempts:
        try:
            if CFG.get('create_tables'):
                print('Ensuring database tables exist...')
                Base.metadata.create_all(engine)
                # ensure migrations for simple additive schema changes (like new columns)
                try:
                    # add 'used' column to questions table if it doesn't exist (Postgres supports IF NOT EXISTS)
                    from sqlalchemy import text
                    with engine.begin() as conn:
                        conn.execute(text("ALTER TABLE questions ADD COLUMN IF NOT EXISTS used boolean DEFAULT false"))
                        # ensure column not null for consistency
                        try:
                            conn.execute(text("ALTER TABLE questions ALTER COLUMN used SET NOT NULL"))
                        except Exception:
                            # if setting NOT NULL fails (older versions), ignore — column will default to false
                            pass
                        # add 'used' column to code_words if missing
                        try:
                            conn.execute(text("ALTER TABLE code_words ADD COLUMN IF NOT EXISTS used boolean DEFAULT false"))
                            try:
                                conn.execute(text("ALTER TABLE code_words ALTER COLUMN used SET NOT NULL"))
                            except Exception:
                                pass
                        except Exception:
                            # ignore if code_words doesn't exist yet or other issues
                            pass
                        # add 'is_task' column to questions if missing
                        try:
                            conn.execute(text("ALTER TABLE questions ADD COLUMN IF NOT EXISTS is_task boolean DEFAULT false"))
                            try:
                                conn.execute(text("ALTER TABLE questions ALTER COLUMN is_task SET NOT NULL"))
                            except Exception:
                                pass
                        except Exception:
                            pass
                        # add default_language to game_state if missing
                        try:
                            conn.execute(text("ALTER TABLE game_state ADD COLUMN IF NOT EXISTS default_language varchar(16) DEFAULT 'en'"))
                        except Exception:
                            pass
                        # add question/task timeout columns to game_state if missing
                        try:
                            conn.execute(text("ALTER TABLE game_state ADD COLUMN IF NOT EXISTS question_timeout_seconds integer DEFAULT 10"))
                        except Exception:
                            pass
                        try:
                            conn.execute(text("ALTER TABLE game_state ADD COLUMN IF NOT EXISTS task_timeout_seconds integer DEFAULT 300"))
                        except Exception:
                            pass
                        # add language to participants if missing
                        try:
                            conn.execute(text("ALTER TABLE participants ADD COLUMN IF NOT EXISTS language varchar(16) DEFAULT 'en'"))
                        except Exception:
                            pass
                        # add correct_count to participants if missing (integer, default 0)
                        try:
                            conn.execute(text("ALTER TABLE participants ADD COLUMN IF NOT EXISTS correct_count integer DEFAULT 0"))
                        except Exception:
                            pass
                        # add rating to task_submissions if missing (nullable integer)
                        try:
                            conn.execute(text("ALTER TABLE task_submissions ADD COLUMN IF NOT EXISTS rating integer"))
                        except Exception:
                            pass
                except Exception as e:
                    print('Warning: could not apply simple migrations:', e)

            # insert default admin and sample questions if needed
            db = SessionLocal()
            admin = db.query(AdminUser).filter_by(username='admin').first()
            if not admin:
                db.add(AdminUser(username="admin", password_hash=pwd_context.hash("admin")))

            # ensure at least a couple of sample questions exist
            qcount = db.query(Question).count()
            if qcount == 0:
                sample_questions = [
                    Question(question_text="What is the birthday person's favorite color?",
                             correct_answer="Blue",
                             options=json.dumps(["Blue", "Green", "Red"]),
                             quest_id=1),
                    Question(question_text="Which city was the birthday person born in?",
                             correct_answer="New York",
                             options=json.dumps(["Los Angeles", "New York", "Chicago"]),
                             quest_id=1),
                ]
                db.add_all(sample_questions)

            gs = db.query(GameState).first()
            if not gs:
                gs = GameState(is_active=False, current_phase="idle", updated_at=datetime.utcnow())
                db.add(gs)

            db.commit()
            print('DB initialization complete')
            break
        except OperationalError as e:
            attempts += 1
            print(f'Postgres not ready yet (attempt {attempts}/{max_attempts}):', e)
            time.sleep(wait_seconds)
            continue
        except SQLAlchemyError as e:
            if db is not None:
                try:
                    db.rollback()
                except Exception:
                    pass
            print('DB init error:', e)
            break
        finally:
            if db is not None:
                try:
                    db.close()
                except Exception:
                    pass
