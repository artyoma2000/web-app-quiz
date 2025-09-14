from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text
from sqlalchemy.ext.declarative import declarative_base
from datetime import datetime

Base = declarative_base()


class UserSession(Base):
    __tablename__ = 'user_sessions'
    id = Column(Integer, primary_key=True)
    telegram_username = Column(String(128), nullable=False)
    session_id = Column(String(128), nullable=False, unique=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class Question(Base):
    __tablename__ = 'questions'
    id = Column(Integer, primary_key=True)
    question_text = Column(Text, nullable=False)
    correct_answer = Column(String(256), nullable=False)
    options = Column(Text, nullable=False)  # JSON string
    quest_id = Column(Integer, nullable=False)
    used = Column(Boolean, default=False, nullable=False)
    # whether this question is a task (e.g., upload a selfie) delivered per participant
    is_task = Column(Boolean, default=False, nullable=False)
    # removed is_active: questions are considered present unless removed via admin in future


class UserAnswer(Base):
    __tablename__ = 'user_answers'
    id = Column(Integer, primary_key=True)
    session_id = Column(String(128), nullable=False)
    question_id = Column(Integer, nullable=False)
    answer = Column(String(256), nullable=False)
    is_correct = Column(Boolean, nullable=False)
    answered_at = Column(DateTime, default=datetime.utcnow)


class GameState(Base):
    __tablename__ = 'game_state'
    id = Column(Integer, primary_key=True)
    is_active = Column(Boolean, default=False)
    current_phase = Column(String(64), default='idle')
    default_language = Column(String(16), default='en')
    # default timeouts (seconds) for inline questions and tasks
    question_timeout_seconds = Column(Integer, default=10)
    task_timeout_seconds = Column(Integer, default=300)
    updated_at = Column(DateTime, default=datetime.utcnow)


class AdminUser(Base):
    __tablename__ = 'admin_users'
    id = Column(Integer, primary_key=True)
    username = Column(String(64), unique=True, nullable=False)
    password_hash = Column(String(256), nullable=False)


class QRCode(Base):
    __tablename__ = 'qrcodes'
    id = Column(Integer, primary_key=True)
    code = Column(Integer, unique=True, nullable=False)  # the numeric code embedded in QR
    quest_id = Column(Integer, nullable=False)  # which quest/group this code belongs to
    # removed is_active flag; all QR codes in table are considered active unless deleted


class UserScan(Base):
    __tablename__ = 'user_scans'
    id = Column(Integer, primary_key=True)
    session_id = Column(String(128), nullable=False)
    # store the raw scanned payload (numeric or word) as string for flexibility
    code = Column(String(128), nullable=False)
    scanned_at = Column(DateTime, default=datetime.utcnow)


class UserServedQuestion(Base):
    __tablename__ = 'user_served_questions'
    id = Column(Integer, primary_key=True)
    session_id = Column(String(128), nullable=False)
    question_id = Column(Integer, nullable=False)
    served_at = Column(DateTime, default=datetime.utcnow)


class CodeWord(Base):
    __tablename__ = 'code_words'
    id = Column(Integer, primary_key=True)
    word = Column(String(128), unique=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    used = Column(Boolean, default=False, nullable=False)


class Participant(Base):
    __tablename__ = 'participants'
    id = Column(Integer, primary_key=True)
    username = Column(String(128), unique=True, nullable=False)
    password_hash = Column(String(256), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    language = Column(String(16), default='en')
    # number of correct answers / admin-awarded points
    correct_count = Column(Integer, default=0)


class TaskSubmission(Base):
    __tablename__ = 'task_submissions'
    id = Column(Integer, primary_key=True)
    session_id = Column(String(128), nullable=False)
    question_id = Column(Integer, nullable=False)
    filename = Column(String(512), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    # admin-assigned rating (0..5); null if not rated yet
    rating = Column(Integer, nullable=True)


class Box(Base):
    __tablename__ = 'boxes'
    id = Column(Integer, primary_key=True)
    box_index = Column(Integer, nullable=False, unique=True)
    hint_filename = Column(String(512), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
