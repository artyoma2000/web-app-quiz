from pydantic import BaseModel
from typing import List, Optional


class SessionCreate(BaseModel):
    telegram_username: str
    session_id: str


class QuestionOut(BaseModel):
    id: int
    question_text: str
    options: List[str]
    is_task: Optional[bool] = False


class ScanRequest(BaseModel):
    session_id: str
    # QR payload may be a numeric code or a short method string (e.g. "random").
    # Keep as string for flexibility; routers will coerce to int when appropriate.
    code: str


class ScanResult(BaseModel):
    question: Optional[QuestionOut]
    time_limit_seconds: int = 90
    message: Optional[str]


class QuestionCreate(BaseModel):
    question_text: str
    correct_answer: str
    options: List[str]
    quest_id: Optional[int] = 1
    is_task: Optional[bool] = False


class QRCodeCreate(BaseModel):
    code: int
    quest_id: int


class CodeWordCreate(BaseModel):
    word: str


class CodeWordOut(BaseModel):
    id: int
    word: str


class AnswerIn(BaseModel):
    session_id: str
    question_id: int
    answer: str


class LeaderboardRow(BaseModel):
    telegram_username: str
    correct_count: int
    completion_pct: float


class RaffleResult(BaseModel):
    winners: List[str]


class ParticipantCreate(BaseModel):
    username: str
    password: str


class ParticipantOut(BaseModel):
    id: int
    username: str
    created_at: str


class TaskQuestionOut(BaseModel):
    id: int
    question_text: str
    quest_id: int
    is_task: bool


class TaskSubmissionOut(BaseModel):
    id: int
    session_id: str
    question_id: int
    filename: str
    created_at: str
