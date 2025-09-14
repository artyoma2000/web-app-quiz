from fastapi import APIRouter, Depends, HTTPException, Request, Response, UploadFile, File, Form
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from sqlalchemy.orm import Session
from . import models, schemas
from .db import SessionLocal
import random
import json
from datetime import datetime
from sqlalchemy import func, case, or_

api_router = APIRouter(prefix="/api")
security = HTTPBasic()


def get_db():
    dbs = SessionLocal()
    try:
        yield dbs
    finally:
        dbs.close()


@api_router.post('/session')
def create_session(payload: schemas.SessionCreate, db: Session = Depends(get_db)):
    # create or update session
    s = db.query(models.UserSession).filter_by(session_id=payload.session_id).first()
    if not s:
        s = models.UserSession(telegram_username=payload.telegram_username, session_id=payload.session_id)
        db.add(s)
    else:
        s.telegram_username = payload.telegram_username
    db.commit()
    return {"ok": True}


@api_router.post('/participant/register')
def participant_register(payload: dict, db: Session = Depends(get_db)):
    # payload: { username, password, session_id }
    username = payload.get('username')
    password = payload.get('password')
    session_id = payload.get('session_id')
    if not username or not password or not session_id:
        raise HTTPException(status_code=400, detail='Missing fields')
    # check if participant exists
    p = db.query(models.Participant).filter_by(username=username).first()
    from passlib.context import CryptContext
    pwd = CryptContext(schemes=["bcrypt"], deprecated='auto')
    # Do NOT allow self-registration. Participant must be created by admin.
    if not p:
        raise HTTPException(status_code=403, detail='Registration disabled; contact an administrator')
    # verify password
    if not pwd.verify(password, p.password_hash):
        raise HTTPException(status_code=401, detail='Invalid credentials')
    # create/update session
    s = db.query(models.UserSession).filter_by(session_id=session_id).first()
    if not s:
        s = models.UserSession(telegram_username=username, session_id=session_id)
        db.add(s)
    else:
        s.telegram_username = username
    db.commit()
    return {"ok": True}


@api_router.get('/quest/{quest_id}')
def get_quest(quest_id: int, request: Request, db: Session = Depends(get_db)):
    # ensure session exists (accept session_id via cookie or query)
    session_id = request.cookies.get('session_id') or request.query_params.get('session_id')
    if not session_id:
        raise HTTPException(status_code=401, detail='No session')
    # pick random question for quest
    q = db.query(models.Question).filter_by(quest_id=quest_id).order_by(models.Question.id).all()
    if not q:
        raise HTTPException(status_code=404, detail='No questions')
    chosen = random.choice(q)
    return {
        "id": chosen.id,
        "question_text": chosen.question_text,
        "options": json.loads(chosen.options)
    }


@api_router.post('/answer')
def submit_answer(payload: schemas.AnswerIn, db: Session = Depends(get_db)):
    q = db.query(models.Question).filter_by(id=payload.question_id).first()
    if not q:
        raise HTTPException(status_code=404, detail='Question not found')
    is_correct = (payload.answer == q.correct_answer)
    ua = models.UserAnswer(session_id=payload.session_id, question_id=q.id, answer=payload.answer, is_correct=is_correct)
    db.add(ua)
    db.commit()
    return {"is_correct": is_correct}


@api_router.get('/leaderboard')
def leaderboard(db: Session = Depends(get_db)):
    # aggregate correct counts per username using LEFT JOIN so users with zero answers are included
    # include admin-awarded correct_count from participants table
    rows = db.query(
        models.UserSession.telegram_username,
        func.count(models.UserAnswer.id).label('total'),
        func.coalesce(func.sum(case([(models.UserAnswer.is_correct == True, 1)], else_=0)), 0).label('correct_answers'),
        func.coalesce(func.max(models.Participant.correct_count), 0).label('awarded')
    ).outerjoin(models.UserAnswer, models.UserSession.session_id == models.UserAnswer.session_id).outerjoin(models.Participant, models.UserSession.telegram_username == models.Participant.username).group_by(models.UserSession.telegram_username).all()

    out = []
    for username, total, correct_answers, awarded in rows:
        total_correct = int(correct_answers or 0) + int(awarded or 0)
        pct = (total_correct / total * 100) if total else 0.0
        out.append({'telegram_username': username, 'correct_count': total_correct, 'completion_pct': round(pct, 1)})
    out.sort(key=lambda r: r['correct_count'], reverse=True)
    return out


def check_admin(creds: HTTPBasicCredentials):
    # very small auth: check against AdminUser
    dbs = SessionLocal()
    try:
        user = dbs.query(models.AdminUser).filter_by(username=creds.username).first()
        if not user:
            return False
        # verify password
        from passlib.context import CryptContext
        pwd = CryptContext(schemes=["bcrypt"], deprecated='auto')
        return pwd.verify(creds.password, user.password_hash)
    finally:
        dbs.close()


@api_router.post('/admin/start')
def admin_start(creds: HTTPBasicCredentials = Depends(security)):
    if not check_admin(creds):
        raise HTTPException(status_code=401)
    dbs = SessionLocal()
    gs = dbs.query(models.GameState).first()
    if not gs:
        gs = models.GameState(is_active=True, current_phase='running', updated_at=datetime.utcnow())
        dbs.add(gs)
    else:
        gs.is_active = True
        gs.current_phase = 'running'
        gs.updated_at = datetime.utcnow()
    dbs.commit()
    dbs.close()
    return {"ok": True}


@api_router.post('/admin/end')
def admin_end(creds: HTTPBasicCredentials = Depends(security)):
    if not check_admin(creds):
        raise HTTPException(status_code=401)
    dbs = SessionLocal()
    gs = dbs.query(models.GameState).first()
    if gs:
        gs.is_active = False
        gs.current_phase = 'ended'
        gs.updated_at = datetime.utcnow()
        dbs.commit()
    dbs.close()
    return {"ok": True}


@api_router.post('/admin/raffle')
def admin_raffle(payload: dict, creds: HTTPBasicCredentials = Depends(security)):
    # payload: {"winners": int}
    if not check_admin(creds):
        raise HTTPException(status_code=401)
    num = int(payload.get('winners', 1))
    dbs = SessionLocal()
    # compute correct counts per username for all registered sessions (include zeros)
    from sqlalchemy import func, case
    rows = dbs.query(
        models.UserSession.telegram_username,
        func.coalesce(func.sum(case([(models.UserAnswer.is_correct == True, 1)], else_=0)), 0).label('correct')
    ).outerjoin(models.UserAnswer, models.UserSession.session_id == models.UserAnswer.session_id).group_by(models.UserSession.telegram_username).all()
    # convert rows to a list of (username, weight)
    stats = [(username, int(correct)) for username, correct in rows if username]
    if not stats:
        dbs.close()
        return {"winners": []}

    participants = [[username, max(1, score)] for username, score in stats]
    winners = []
    # weighted sampling without replacement using cumulative weights
    import random as _random
    for _ in range(min(num, len(participants))):
        total = sum(w for _, w in participants)
        if total <= 0:
            break
        r = _random.uniform(0, total)
        cum = 0
        chosen_index = None
        for i, (user, w) in enumerate(participants):
            cum += w
            if r <= cum:
                chosen_index = i
                break
        if chosen_index is None:
            chosen_index = len(participants) - 1
        winners.append(participants[chosen_index][0])
        # remove chosen participant to avoid duplicates
        participants.pop(chosen_index)

    dbs.close()
    return {"winners": winners}


@api_router.get('/admin/game')
def admin_game_status(creds: HTTPBasicCredentials = Depends(security)):
    if not check_admin(creds):
        raise HTTPException(status_code=401)
    dbs = SessionLocal()
    try:
        gs = dbs.query(models.GameState).first()
        if not gs:
            return {"is_active": False, "current_phase": "idle", "updated_at": None}
        return {"is_active": bool(gs.is_active), "current_phase": gs.current_phase, "updated_at": gs.updated_at}
    finally:
        dbs.close()


@api_router.get('/admin/settings/language')
def admin_get_language(creds: HTTPBasicCredentials = Depends(security)):
    if not check_admin(creds):
        raise HTTPException(status_code=401)
    dbs = SessionLocal()
    try:
        gs = dbs.query(models.GameState).first()
        lang = getattr(gs, 'default_language', 'en') if gs else 'en'
        return {"default_language": lang}
    finally:
        dbs.close()


@api_router.post('/admin/settings/language')
def admin_set_language(payload: dict, creds: HTTPBasicCredentials = Depends(security)):
    # payload: { default_language: 'en' }
    if not check_admin(creds):
        raise HTTPException(status_code=401)
    lang = payload.get('default_language')
    if not lang:
        raise HTTPException(status_code=400, detail='Missing language')
    dbs = SessionLocal()
    try:
        gs = dbs.query(models.GameState).first()
        if not gs:
            gs = models.GameState(is_active=False, current_phase='idle', default_language=lang)
            dbs.add(gs)
        else:
            gs.default_language = lang
        # apply to all participants as default
        try:
            dbs.execute("UPDATE participants SET language = :lang", {'lang': lang})
        except Exception:
            # fallback: iterate
            parts = dbs.query(models.Participant).all()
            for p in parts:
                p.language = lang
        dbs.commit()
        return {"default_language": lang}
    finally:
        dbs.close()


@api_router.get('/settings/language')
def get_default_language():
    # public endpoint for clients to fetch current default language
    dbs = SessionLocal()
    try:
        gs = dbs.query(models.GameState).first()
        lang = getattr(gs, 'default_language', 'en') if gs else 'en'
        return {"default_language": lang}
    finally:
        dbs.close()


@api_router.get('/admin/settings/timeouts')
def admin_get_timeouts(creds: HTTPBasicCredentials = Depends(security)):
    if not check_admin(creds):
        raise HTTPException(status_code=401)
    dbs = SessionLocal()
    try:
        gs = dbs.query(models.GameState).first()
        return {
            'question_timeout_seconds': getattr(gs, 'question_timeout_seconds', 10) if gs else 10,
            'task_timeout_seconds': getattr(gs, 'task_timeout_seconds', 300) if gs else 300
        }
    finally:
        dbs.close()


@api_router.post('/admin/settings/timeouts')
def admin_set_timeouts(payload: dict, creds: HTTPBasicCredentials = Depends(security)):
    if not check_admin(creds):
        raise HTTPException(status_code=401)
    q = payload.get('question_timeout_seconds')
    t = payload.get('task_timeout_seconds')
    if q is None or t is None:
        raise HTTPException(status_code=400, detail='Missing fields')
    try:
        qv = int(q)
        tv = int(t)
    except Exception:
        raise HTTPException(status_code=400, detail='Invalid timeout values')
    dbs = SessionLocal()
    try:
        gs = dbs.query(models.GameState).first()
        if not gs:
            gs = models.GameState(is_active=False, current_phase='idle', question_timeout_seconds=qv, task_timeout_seconds=tv)
            dbs.add(gs)
        else:
            gs.question_timeout_seconds = qv
            gs.task_timeout_seconds = tv
        dbs.commit()
        return {'question_timeout_seconds': qv, 'task_timeout_seconds': tv}
    finally:
        dbs.close()


@api_router.post('/admin/settings/change_password')
def admin_change_password(payload: dict, creds: HTTPBasicCredentials = Depends(security)):
    """Payload: { username: str, new_password: str }
    Auth: basic auth of an existing admin (current credentials) is required to change any admin password.
    """
    # verify caller's credentials
    if not check_admin(creds):
        raise HTTPException(status_code=401)
    username = payload.get('username')
    new_password = payload.get('new_password')
    if not username or not new_password:
        raise HTTPException(status_code=400, detail='Missing fields')
    # hash new password and update admin user
    from passlib.context import CryptContext
    pwd = CryptContext(schemes=["bcrypt"], deprecated='auto')
    dbs = SessionLocal()
    try:
        user = dbs.query(models.AdminUser).filter_by(username=username).first()
        if not user:
            raise HTTPException(status_code=404, detail='Admin user not found')
        user.password_hash = pwd.hash(new_password)
        dbs.commit()
        return {"ok": True}
    finally:
        dbs.close()


@api_router.post('/scan', response_model=schemas.ScanResult)
def scan_code(payload: schemas.ScanRequest, db: Session = Depends(get_db)):
    # verify session exists
    s = db.query(models.UserSession).filter_by(session_id=payload.session_id).first()
    if not s:
        raise HTTPException(status_code=401, detail='Unknown session')

    # ensure the game is currently active (started and not ended)
    gs = db.query(models.GameState).first()
    if not gs or not getattr(gs, 'is_active', False):
        # game hasn't been started or has been ended
        return schemas.ScanResult(question=None, time_limit_seconds=0, message='Game not active')

    # support special method payloads (e.g. 'random') or numeric codes
    code_raw = str(payload.code or '')
    # check if payload matches any admin-managed code word
    cw = db.query(models.CodeWord).filter(func.lower(models.CodeWord.word) == code_raw.lower()).first()
    if cw is not None or code_raw.lower() == 'random':
        # treat admin-managed words and literal 'random' as a trigger to pick from all questions
        qr = None
        is_word_trigger = True
        # if this is an admin-managed word, ensure it hasn't been used already
        if cw is not None and getattr(cw, 'used', False):
            return schemas.ScanResult(question=None, time_limit_seconds=0, message='Word already used')
    else:
        is_word_trigger = False
        # try numeric code
        try:
            code_int = int(code_raw)
        except Exception:
            return schemas.ScanResult(question=None, time_limit_seconds=0, message='Invalid code format')
        qr = db.query(models.QRCode).filter_by(code=code_int).first()
        if not qr:
            return schemas.ScanResult(question=None, time_limit_seconds=0, message='Invalid or inactive code')

    # ensure user hasn't already scanned this code
    prior = db.query(models.UserScan).filter_by(session_id=payload.session_id, code=payload.code).first()
    if prior:
        return schemas.ScanResult(question=None, time_limit_seconds=0, message='Code already scanned')

    # record the scan
    us = models.UserScan(session_id=payload.session_id, code=payload.code)
    db.add(us)
    db.commit()

    # find questions that the user hasn't answered yet and haven't been served to them
    answered_qs = db.query(models.UserAnswer.question_id).filter_by(session_id=payload.session_id).subquery()
    served_qs = db.query(models.UserServedQuestion.question_id).filter_by(session_id=payload.session_id).subquery()
    # Make tasks available to different participants even if their global 'used' flag is True.
    # We still exclude questions already answered by this session or previously served to this session.
    if is_word_trigger or code_raw.lower() == 'random':
        # search across all quests: include questions that are tasks OR not marked used
        avail = db.query(models.Question).filter(~models.Question.id.in_(answered_qs), ~models.Question.id.in_(served_qs), or_(models.Question.is_task == True, models.Question.used == False)).all()
    else:
        avail = db.query(models.Question).filter(models.Question.quest_id == qr.quest_id, ~models.Question.id.in_(answered_qs), ~models.Question.id.in_(served_qs), or_(models.Question.is_task == True, models.Question.used == False)).all()
    if not avail:
        return schemas.ScanResult(question=None, time_limit_seconds=0, message='No available questions for this QR')

    chosen = random.choice(avail)
    # record that this question was served so it won't be repeated for this session
    usq = models.UserServedQuestion(session_id=payload.session_id, question_id=chosen.id)
    db.add(usq)
    # For regular (non-task) questions, mark them as used globally so they are not served again.
    # For task-type questions (is_task=True) we intentionally do NOT mark them used so the same task
    # can be given to different participants; served_qs prevents re-serving to the same session.
    if not getattr(chosen, 'is_task', False):
        chosen.used = True
        db.add(chosen)
    # if this scan was triggered by an admin-managed codeword, mark that word used as well
    if cw is not None:
        cw.used = True
        db.add(cw)
    db.commit()

    qout = schemas.QuestionOut(id=chosen.id, question_text=chosen.question_text, options=json.loads(chosen.options) if chosen.options else [], is_task=getattr(chosen, 'is_task', False))
    # determine time limit: prefer per-question setting if available (not currently stored), otherwise use GameState defaults
    gs = db.query(models.GameState).first()
    if getattr(chosen, 'is_task', False):
        time_limit = getattr(gs, 'task_timeout_seconds', 300) if gs else 300
    else:
        time_limit = getattr(gs, 'question_timeout_seconds', 10) if gs else 10
    return schemas.ScanResult(question=qout, time_limit_seconds=int(time_limit or 0), message='')


@api_router.post('/admin/question')
def admin_create_question(payload: schemas.QuestionCreate, creds: HTTPBasicCredentials = Depends(security)):
    if not check_admin(creds):
        raise HTTPException(status_code=401)
    dbs = SessionLocal()
    import json as _json
    q = models.Question(question_text=payload.question_text, correct_answer=payload.correct_answer, options=_json.dumps(payload.options), quest_id=payload.quest_id, is_task=bool(payload.is_task))
    dbs.add(q)
    dbs.commit()
    qid = q.id
    dbs.close()
    return {"id": qid}



@api_router.get('/admin/tasks')
def admin_list_tasks(creds: HTTPBasicCredentials = Depends(security)):
    if not check_admin(creds):
        raise HTTPException(status_code=401)
    dbs = SessionLocal()
    rows = dbs.query(models.Question).filter(models.Question.is_task == True).order_by(models.Question.id.desc()).all()
    out = [{'id': r.id, 'question_text': r.question_text, 'quest_id': r.quest_id, 'is_task': True} for r in rows]
    dbs.close()
    return out


@api_router.get('/admin/tasks/summary')
def admin_tasks_summary(creds: HTTPBasicCredentials = Depends(security)):
    """Return summary statistics for task submissions: total and rated counts per question id."""
    if not check_admin(creds):
        raise HTTPException(status_code=401)
    dbs = SessionLocal()
    try:
        rows = dbs.query(
            models.Question.id,
            func.count(models.TaskSubmission.id).label('total'),
            func.coalesce(func.sum(case([(models.TaskSubmission.rating != None, 1)], else_=0)), 0).label('rated')
        ).outerjoin(models.TaskSubmission, models.Question.id == models.TaskSubmission.question_id).filter(models.Question.is_task == True).group_by(models.Question.id).all()
        out = []
        for qid, total, rated in rows:
            out.append({'question_id': qid, 'total': int(total or 0), 'rated': int(rated or 0)})
        return out
    finally:
        dbs.close()


@api_router.get('/admin/tasks/submissions/{question_id}')
def admin_task_submissions(question_id: int, creds: HTTPBasicCredentials = Depends(security)):
    if not check_admin(creds):
        raise HTTPException(status_code=401)
    dbs = SessionLocal()
    subs = dbs.query(models.TaskSubmission).filter_by(question_id=question_id).order_by(models.TaskSubmission.created_at.desc()).all()
    out = []
    for s in subs:
        username = None
        try:
            if s.session_id:
                us = dbs.query(models.UserSession).filter_by(session_id=s.session_id).first()
                if us:
                    username = getattr(us, 'telegram_username', None)
        except Exception:
            username = None
        out.append({'id': s.id, 'session_id': s.session_id, 'username': username, 'question_id': s.question_id, 'filename': s.filename, 'created_at': s.created_at, 'rating': getattr(s, 'rating', None)})
    dbs.close()
    return out


@api_router.post('/admin/tasks/submit_rating')
def admin_submit_rating(payload: dict, creds: HTTPBasicCredentials = Depends(security)):
    """Payload: { submission_id: int, points: int }
    Adds points to the participant balance and records rating on submission. Rating can only be applied once per submission.
    """
    if not check_admin(creds):
        raise HTTPException(status_code=401)
    submission_id = payload.get('submission_id')
    points = payload.get('points')
    try:
        submission_id = int(submission_id)
        points = int(points)
    except Exception:
        raise HTTPException(status_code=400, detail='Invalid payload')
    if points < 0 or points > 5:
        raise HTTPException(status_code=400, detail='Points must be 0..5')
    dbs = SessionLocal()
    try:
        sub = dbs.query(models.TaskSubmission).filter_by(id=submission_id).first()
        if not sub:
            raise HTTPException(status_code=404, detail='Submission not found')
        # prevent double-rating
        if getattr(sub, 'rating', None) is not None:
            raise HTTPException(status_code=400, detail='Already rated')
        # find participant by session -> username -> participant
        username = None
        if sub.session_id:
            us = dbs.query(models.UserSession).filter_by(session_id=sub.session_id).first()
            if us:
                username = getattr(us, 'telegram_username', None)
        if not username:
            raise HTTPException(status_code=400, detail='No participant associated with this submission')
        participant = dbs.query(models.Participant).filter_by(username=username).first()
        if not participant:
            raise HTTPException(status_code=404, detail='Participant not found')
        # apply rating and add points to correct_count
        sub.rating = points
        participant.correct_count = (participant.correct_count or 0) + points
        dbs.add(sub)
        dbs.add(participant)
        dbs.commit()
        return {'ok': True, 'new_correct_count': participant.correct_count}
    finally:
        dbs.close()



@api_router.post('/tasks/submit')
def submit_task(question_id: int = Form(...), session_id: str = Form(...), file: UploadFile = File(...), db: Session = Depends(get_db)):
    # session_id must be provided so we know which participant submits
    if not session_id:
        raise HTTPException(status_code=400, detail='Missing session_id')
    # ensure question exists and is a task
    q = db.query(models.Question).filter_by(id=question_id).first()
    if not q or not getattr(q, 'is_task', False):
        raise HTTPException(status_code=404, detail='Task not found')
    # ensure participant hasn't submitted this task before
    exists = db.query(models.TaskSubmission).filter_by(session_id=session_id, question_id=question_id).first()
    if exists:
        raise HTTPException(status_code=400, detail='Task already submitted')
    # basic server-side validation: only accept image/* and limit size
    allowed = ['image/jpeg', 'image/png', 'image/webp']
    if file.content_type not in allowed:
        raise HTTPException(status_code=400, detail='Invalid file type')
    # read file into memory up to a limit
    raw = file.file.read()
    max_bytes = 8 * 1024 * 1024
    if len(raw) > max_bytes:
        raise HTTPException(status_code=400, detail='File too large')
    # save file to uploads/ folder
    import os
    UPLOAD_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'uploads'))
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    # create a safe filename
    safe_name = f"{session_id}_{question_id}_{int(datetime.utcnow().timestamp())}_{file.filename}"
    save_path = os.path.join(UPLOAD_DIR, safe_name)
    with open(save_path, 'wb') as f:
        f.write(raw)
    ts = models.TaskSubmission(session_id=session_id, question_id=question_id, filename=safe_name)
    db.add(ts)
    db.commit()
    return {"ok": True, "filename": safe_name}


@api_router.post('/admin/questions/reset')
def admin_reset_questions(creds: HTTPBasicCredentials = Depends(security)):
    if not check_admin(creds):
        raise HTTPException(status_code=401)
    dbs = SessionLocal()
    try:
        dbs.query(models.Question).update({models.Question.used: False})
        dbs.commit()
    finally:
        dbs.close()
    return {"ok": True}


@api_router.post('/admin/qrcode')
def admin_create_qrcode(payload: schemas.QRCodeCreate, creds: HTTPBasicCredentials = Depends(security)):
    if not check_admin(creds):
        raise HTTPException(status_code=401)
    dbs = SessionLocal()
    # ensure code unique
    exists = dbs.query(models.QRCode).filter_by(code=payload.code).first()
    if exists:
        dbs.close()
        raise HTTPException(status_code=400, detail='Code already exists')
    qr = models.QRCode(code=payload.code, quest_id=payload.quest_id)
    dbs.add(qr)
    dbs.commit()
    qid = qr.id
    dbs.close()
    return {"id": qid}


@api_router.post('/admin/codeword')
def admin_create_codeword(payload: schemas.CodeWordCreate, creds: HTTPBasicCredentials = Depends(security)):
    if not check_admin(creds):
        raise HTTPException(status_code=401)
    dbs = SessionLocal()
    exists = dbs.query(models.CodeWord).filter(func.lower(models.CodeWord.word) == payload.word.lower()).first()
    if exists:
        dbs.close()
        raise HTTPException(status_code=400, detail='Word already exists')
    cw = models.CodeWord(word=payload.word)
    dbs.add(cw)
    dbs.commit()
    wid = cw.id
    dbs.close()
    return {"id": wid}


@api_router.get('/admin/codewords')
def admin_list_codewords(creds: HTTPBasicCredentials = Depends(security)):
    if not check_admin(creds):
        raise HTTPException(status_code=401)
    dbs = SessionLocal()
    rows = dbs.query(models.CodeWord).order_by(models.CodeWord.id.desc()).all()
    out = [{'id': r.id, 'word': r.word} for r in rows]
    dbs.close()
    return out


@api_router.delete('/admin/codeword/{word_id}')
def admin_delete_codeword(word_id: int, creds: HTTPBasicCredentials = Depends(security)):
    if not check_admin(creds):
        raise HTTPException(status_code=401)
    dbs = SessionLocal()
    cw = dbs.query(models.CodeWord).filter_by(id=word_id).first()
    if not cw:
        dbs.close()
        raise HTTPException(status_code=404, detail='Not found')
    dbs.delete(cw)
    dbs.commit()
    dbs.close()
    return {"ok": True}


def _uploads_dir():
    import os
    return os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'uploads'))


def _delete_submission_files(dbs, submissions):
    import os
    UPLOAD_DIR = _uploads_dir()
    for s in submissions:
        try:
            path = os.path.join(UPLOAD_DIR, s.filename)
            if os.path.exists(path):
                os.remove(path)
        except Exception:
            pass


@api_router.delete('/admin/question/{question_id}')
def admin_delete_question(question_id: int, creds: HTTPBasicCredentials = Depends(security)):
    if not check_admin(creds):
        raise HTTPException(status_code=401)
    dbs = SessionLocal()
    try:
        q = dbs.query(models.Question).filter_by(id=question_id).first()
        if not q:
            raise HTTPException(status_code=404, detail='Not found')
        # delete related task submissions and files
        subs = dbs.query(models.TaskSubmission).filter_by(question_id=question_id).all()
        _delete_submission_files(dbs, subs)
        for s in subs:
            dbs.delete(s)
        # delete served questions and answers referencing this question
        dbs.query(models.UserServedQuestion).filter_by(question_id=question_id).delete()
        dbs.query(models.UserAnswer).filter_by(question_id=question_id).delete()
        # finally delete the question
        dbs.delete(q)
        dbs.commit()
        return {"ok": True}
    finally:
        dbs.close()


@api_router.delete('/admin/participant/{participant_id}')
def admin_delete_participant(participant_id: int, creds: HTTPBasicCredentials = Depends(security)):
    if not check_admin(creds):
        raise HTTPException(status_code=401)
    dbs = SessionLocal()
    try:
        p = dbs.query(models.Participant).filter_by(id=participant_id).first()
        if not p:
            raise HTTPException(status_code=404, detail='Not found')
        username = p.username
        # find sessions for this username
        sessions = dbs.query(models.UserSession).filter_by(telegram_username=username).all()
        session_ids = [s.session_id for s in sessions]
        # delete task submissions and files for these sessions
        if session_ids:
            subs = dbs.query(models.TaskSubmission).filter(models.TaskSubmission.session_id.in_(session_ids)).all()
            _delete_submission_files(dbs, subs)
            for s in subs:
                dbs.delete(s)
            # delete answers, served questions, scans for these sessions
            dbs.query(models.UserAnswer).filter(models.UserAnswer.session_id.in_(session_ids)).delete(synchronize_session=False)
            dbs.query(models.UserServedQuestion).filter(models.UserServedQuestion.session_id.in_(session_ids)).delete(synchronize_session=False)
            dbs.query(models.UserScan).filter(models.UserScan.session_id.in_(session_ids)).delete(synchronize_session=False)
            # delete sessions themselves
            for s in sessions:
                dbs.delete(s)
        # finally delete participant
        dbs.delete(p)
        dbs.commit()
        return {"ok": True}
    finally:
        dbs.close()


@api_router.delete('/admin/tasks/all')
def admin_delete_all_tasks(creds: HTTPBasicCredentials = Depends(security)):
    if not check_admin(creds):
        raise HTTPException(status_code=401)
    dbs = SessionLocal()
    try:
        # find all task questions
        tasks = dbs.query(models.Question).filter(models.Question.is_task == True).all()
        task_ids = [t.id for t in tasks]
        # delete submissions files
        if task_ids:
            subs = dbs.query(models.TaskSubmission).filter(models.TaskSubmission.question_id.in_(task_ids)).all()
            _delete_submission_files(dbs, subs)
            for s in subs:
                dbs.delete(s)
        # delete served questions and answers for these tasks
        if task_ids:
            dbs.query(models.UserServedQuestion).filter(models.UserServedQuestion.question_id.in_(task_ids)).delete(synchronize_session=False)
            dbs.query(models.UserAnswer).filter(models.UserAnswer.question_id.in_(task_ids)).delete(synchronize_session=False)
        # delete the task questions
        for t in tasks:
            dbs.delete(t)
        dbs.commit()
        return {"ok": True}
    finally:
        dbs.close()


@api_router.delete('/admin/questions/all')
def admin_delete_all_questions(creds: HTTPBasicCredentials = Depends(security)):
    if not check_admin(creds):
        raise HTTPException(status_code=401)
    dbs = SessionLocal()
    try:
        # find all non-task questions
        qs = dbs.query(models.Question).filter(models.Question.is_task == False).all()
        q_ids = [q.id for q in qs]
        if q_ids:
            subs = dbs.query(models.TaskSubmission).filter(models.TaskSubmission.question_id.in_(q_ids)).all()
            _delete_submission_files(dbs, subs)
            for s in subs:
                dbs.delete(s)
            dbs.query(models.UserServedQuestion).filter(models.UserServedQuestion.question_id.in_(q_ids)).delete(synchronize_session=False)
            dbs.query(models.UserAnswer).filter(models.UserAnswer.question_id.in_(q_ids)).delete(synchronize_session=False)
        for q in qs:
            dbs.delete(q)
        dbs.commit()
        return {"ok": True}
    finally:
        dbs.close()


@api_router.delete('/admin/participants/all')
def admin_delete_all_participants(creds: HTTPBasicCredentials = Depends(security)):
    if not check_admin(creds):
        raise HTTPException(status_code=401)
    dbs = SessionLocal()
    try:
        parts = dbs.query(models.Participant).all()
        # collect usernames
        usernames = [p.username for p in parts]
        session_ids = []
        if usernames:
            sessions = dbs.query(models.UserSession).filter(models.UserSession.telegram_username.in_(usernames)).all()
            session_ids = [s.session_id for s in sessions]
            # delete submissions files for these sessions
            if session_ids:
                subs = dbs.query(models.TaskSubmission).filter(models.TaskSubmission.session_id.in_(session_ids)).all()
                _delete_submission_files(dbs, subs)
                for s in subs:
                    dbs.delete(s)
                dbs.query(models.UserAnswer).filter(models.UserAnswer.session_id.in_(session_ids)).delete(synchronize_session=False)
                dbs.query(models.UserServedQuestion).filter(models.UserServedQuestion.session_id.in_(session_ids)).delete(synchronize_session=False)
                dbs.query(models.UserScan).filter(models.UserScan.session_id.in_(session_ids)).delete(synchronize_session=False)
            for s in sessions:
                dbs.delete(s)
        for p in parts:
            dbs.delete(p)
        dbs.commit()
        return {"ok": True}
    finally:
        dbs.close()


@api_router.delete('/admin/codewords/all')
def admin_delete_all_codewords(creds: HTTPBasicCredentials = Depends(security)):
    if not check_admin(creds):
        raise HTTPException(status_code=401)
    dbs = SessionLocal()
    try:
        dbs.query(models.CodeWord).delete()
        dbs.commit()
        return {"ok": True}
    finally:
        dbs.close()


@api_router.get('/admin/questions')
def admin_list_questions(creds: HTTPBasicCredentials = Depends(security)):
    if not check_admin(creds):
        raise HTTPException(status_code=401)
    dbs = SessionLocal()
    rows = dbs.query(models.Question).filter(models.Question.is_task == False).order_by(models.Question.id.desc()).all()
    out = []
    import json as _json
    for q in rows:
        out.append({
            'id': q.id,
            'question_text': q.question_text,
            'options': _json.loads(q.options),
            'correct_answer': q.correct_answer,
            'quest_id': q.quest_id,
            # is_active removed
        })
    dbs.close()
    return out


@api_router.post('/admin/participant')
def admin_create_participant(payload: dict, creds: HTTPBasicCredentials = Depends(security)):
    if not check_admin(creds):
        raise HTTPException(status_code=401)
    username = payload.get('username')
    password = payload.get('password')
    if not username or not password:
        raise HTTPException(status_code=400, detail='Missing username or password')
    dbs = SessionLocal()
    exists = dbs.query(models.Participant).filter_by(username=username).first()
    if exists:
        dbs.close()
        raise HTTPException(status_code=400, detail='Username already exists')
    from passlib.context import CryptContext
    pwd = CryptContext(schemes=["bcrypt"], deprecated='auto')
    ph = pwd.hash(password)
    p = models.Participant(username=username, password_hash=ph)
    dbs.add(p)
    dbs.commit()
    pid = p.id
    dbs.close()
    return {'id': pid}


@api_router.get('/admin/participants')
def admin_list_participants(creds: HTTPBasicCredentials = Depends(security)):
    if not check_admin(creds):
        raise HTTPException(status_code=401)
    dbs = SessionLocal()
    rows = dbs.query(models.Participant).order_by(models.Participant.id.desc()).all()
    out = [{'id': r.id, 'username': r.username, 'created_at': r.created_at.isoformat()} for r in rows]
    dbs.close()
    return out


@api_router.post('/admin/participants/import')
def admin_import_participants(file: UploadFile = File(...), creds: HTTPBasicCredentials = Depends(security)):
    """Import participants from a text file. Each line: <username> <password>
    Lines starting with # or empty lines are ignored. Returns a summary.
    """
    if not check_admin(creds):
        raise HTTPException(status_code=401)
    if not file.filename:
        raise HTTPException(status_code=400, detail='No file uploaded')

    content = None
    try:
        raw = file.file.read()
        try:
            content = raw.decode('utf-8')
        except Exception:
            # fallback to latin-1 to avoid decode errors for weird encodings
            content = raw.decode('latin-1')
    finally:
        try:
            file.file.close()
        except Exception:
            pass

    lines = content.splitlines()
    created = 0
    skipped = 0
    errors = []
    dbs = SessionLocal()
    from passlib.context import CryptContext
    pwd = CryptContext(schemes=["bcrypt"], deprecated='auto')
    for idx, raw_line in enumerate(lines, start=1):
        line = raw_line.strip()
        if not line or line.startswith('#'):
            skipped += 1
            continue
        # split on first whitespace to allow passwords that contain spaces
        parts = line.split(None, 1)
        if len(parts) < 2:
            errors.append({'line': idx, 'reason': 'Invalid format'})
            continue
        username = parts[0].strip()
        password = parts[1].strip()
        if not username or not password:
            errors.append({'line': idx, 'reason': 'Missing username or password'})
            continue
        exists = dbs.query(models.Participant).filter_by(username=username).first()
        if exists:
            skipped += 1
            continue
        try:
            ph = pwd.hash(password)
            p = models.Participant(username=username, password_hash=ph)
            dbs.add(p)
            dbs.commit()
            created += 1
        except Exception as e:
            dbs.rollback()
            errors.append({'line': idx, 'reason': str(e)})

    dbs.close()
    return {'created': created, 'skipped': skipped, 'errors': errors}


@api_router.post('/admin/codewords/import')
def admin_import_codewords(file: UploadFile = File(...), creds: HTTPBasicCredentials = Depends(security)):
    """Import code words from a text file. Each line contains one word. Lines starting with # or empty lines are ignored."""
    if not check_admin(creds):
        raise HTTPException(status_code=401)
    if not file.filename:
        raise HTTPException(status_code=400, detail='No file uploaded')

    try:
        raw = file.file.read()
        try:
            content = raw.decode('utf-8')
        except Exception:
            content = raw.decode('latin-1')
    finally:
        try:
            file.file.close()
        except Exception:
            pass

    lines = content.splitlines()
    created = 0
    skipped = 0
    errors = []
    dbs = SessionLocal()
    for idx, raw_line in enumerate(lines, start=1):
        line = raw_line.strip()
        if not line or line.startswith('#'):
            skipped += 1
            continue
        word = line.strip()
        if not word:
            skipped += 1
            continue
        exists = dbs.query(models.CodeWord).filter(func.lower(models.CodeWord.word) == word.lower()).first()
        if exists:
            skipped += 1
            continue
        try:
            cw = models.CodeWord(word=word)
            dbs.add(cw)
            dbs.commit()
            created += 1
        except Exception as e:
            dbs.rollback()
            errors.append({'line': idx, 'reason': str(e)})

    dbs.close()
    return {'created': created, 'skipped': skipped, 'errors': errors}


@api_router.post('/admin/tasks/import')
def admin_import_tasks(file: UploadFile = File(...), creds: HTTPBasicCredentials = Depends(security)):
    """Import tasks from a text file. Each non-empty, non-# line becomes a task (question with is_task=True).
    Returns a summary similar to participants import."""
    if not check_admin(creds):
        raise HTTPException(status_code=401)
    if not file.filename:
        raise HTTPException(status_code=400, detail='No file uploaded')

    content = None
    try:
        raw = file.file.read()
        try:
            content = raw.decode('utf-8')
        except Exception:
            # fallback to latin-1 to avoid decode errors for weird encodings
            content = raw.decode('latin-1')
    finally:
        try:
            file.file.close()
        except Exception:
            pass

    lines = content.splitlines()
    created = 0
    skipped = 0
    errors = []
    dbs = SessionLocal()
    import json as _json
    for idx, raw_line in enumerate(lines, start=1):
        line = raw_line.strip()
        if not line or line.startswith('#'):
            skipped += 1
            continue
        # each valid line is treated as a task instruction / question_text
        question_text = line
        # avoid duplicates by exact match
        exists = dbs.query(models.Question).filter(models.Question.question_text == question_text, models.Question.is_task == True).first()
        if exists:
            skipped += 1
            continue
        try:
            q = models.Question(question_text=question_text, correct_answer='', options=_json.dumps([]), quest_id=1, is_task=True)
            dbs.add(q)
            dbs.commit()
            created += 1
        except Exception as e:
            dbs.rollback()
            errors.append({'line': idx, 'reason': str(e)})

    dbs.close()
    return {'created': created, 'skipped': skipped, 'errors': errors}


@api_router.get('/admin/boxes')
def admin_list_boxes(creds: HTTPBasicCredentials = Depends(security)):
    if not check_admin(creds):
        raise HTTPException(status_code=401)
    dbs = SessionLocal()
    rows = dbs.query(models.Box).order_by(models.Box.box_index.asc()).all()
    out = [{'box_index': r.box_index, 'hint_filename': r.hint_filename} for r in rows]
    dbs.close()
    return out


@api_router.post('/admin/boxes/count')
def admin_set_box_count(payload: dict, creds: HTTPBasicCredentials = Depends(security)):
    # payload: { count: int }
    if not check_admin(creds):
        raise HTTPException(status_code=401)
    cnt = payload.get('count')
    try:
        cnt = int(cnt)
    except Exception:
        raise HTTPException(status_code=400, detail='Invalid count')
    if cnt < 0 or cnt > 100:
        raise HTTPException(status_code=400, detail='Count out of range')
    dbs = SessionLocal()
    try:
        existing = {b.box_index: b for b in dbs.query(models.Box).all()}
        # create missing boxes up to cnt
        for i in range(1, cnt+1):
            if i not in existing:
                nb = models.Box(box_index=i)
                dbs.add(nb)
        # delete extra boxes
        for idx in list(existing.keys()):
            if idx > cnt:
                dbs.query(models.Box).filter_by(box_index=idx).delete()
        dbs.commit()
        # return current list
        rows = dbs.query(models.Box).order_by(models.Box.box_index.asc()).all()
        out = [{'box_index': r.box_index, 'hint_filename': r.hint_filename} for r in rows]
        return {'boxes': out}
    finally:
        dbs.close()


@api_router.post('/admin/boxes/{box_index}/hint')
def admin_upload_box_hint(box_index: int, file: UploadFile = File(...), creds: HTTPBasicCredentials = Depends(security)):
    # upload image hint for a specific box
    if not check_admin(creds):
        raise HTTPException(status_code=401)
    if not file or not file.filename:
        raise HTTPException(status_code=400, detail='No file uploaded')
    # basic validation
    allowed = ['image/jpeg', 'image/png', 'image/webp']
    if file.content_type not in allowed:
        raise HTTPException(status_code=400, detail='Invalid file type')
    raw = file.file.read()
    max_bytes = 8 * 1024 * 1024
    if len(raw) > max_bytes:
        raise HTTPException(status_code=400, detail='File too large')
    import os
    UPLOAD_DIR = _uploads_dir()
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    safe_name = f"box_{box_index}_{int(datetime.utcnow().timestamp())}_{file.filename}"
    save_path = os.path.join(UPLOAD_DIR, safe_name)
    with open(save_path, 'wb') as f:
        f.write(raw)
    dbs = SessionLocal()
    try:
        b = dbs.query(models.Box).filter_by(box_index=box_index).first()
        if not b:
            # auto-create the box record
            b = models.Box(box_index=box_index, hint_filename=safe_name)
            dbs.add(b)
        else:
            b.hint_filename = safe_name
        dbs.commit()
        return {'ok': True, 'hint_filename': safe_name, 'url': f'/uploads/{safe_name}'}
    finally:
        dbs.close()


@api_router.get('/boxes')
def public_list_boxes():
    """Public endpoint for participants to fetch box list and hint URLs."""
    dbs = SessionLocal()
    try:
        rows = dbs.query(models.Box).order_by(models.Box.box_index.asc()).all()
        out = []
        for r in rows:
            hint_url = f'/uploads/{r.hint_filename}' if r.hint_filename else None
            out.append({'box_index': r.box_index, 'hint_url': hint_url, 'hint_filename': r.hint_filename})
        return out
    finally:
        dbs.close()


@api_router.post('/admin/surveys/import')
def admin_import_surveys(file: UploadFile = File(...), creds: HTTPBasicCredentials = Depends(security)):
    """Import surveys from a text file. Each survey block consists of:
    Line 1: question
    Lines 2-5: four answer options
    Line 6: number 1..4 indicating the correct option
    Repeats for multiple questions. Lines starting with # or empty lines are ignored.
    Returns a summary: {created, skipped, errors}
    """
    if not check_admin(creds):
        raise HTTPException(status_code=401)
    if not file.filename:
        raise HTTPException(status_code=400, detail='No file uploaded')

    content = None
    try:
        raw = file.file.read()
        try:
            content = raw.decode('utf-8')
        except Exception:
            content = raw.decode('latin-1')
    finally:
        try:
            file.file.close()
        except Exception:
            pass

    lines = [ln.rstrip('\r') for ln in content.splitlines()]
    created = 0
    skipped = 0
    errors = []
    dbs = SessionLocal()
    import json as _json
    i = 0
    total = len(lines)
    while i < total:
        # skip empty or comment lines
        if not lines[i].strip() or lines[i].strip().startswith('#'):
            skipped += 1
            i += 1
            continue
        # need at least 6 lines for a block
        if i + 5 >= total:
            errors.append({'line': i+1, 'reason': 'Incomplete survey block'})
            break
        q_text = lines[i].strip()
        opts = [lines[i+1].strip(), lines[i+2].strip(), lines[i+3].strip(), lines[i+4].strip()]
        ans_line = lines[i+5].strip()
        try:
            ans_idx = int(ans_line)
        except Exception:
            errors.append({'line': i+6, 'reason': 'Invalid answer index'})
            i += 6
            continue
        if ans_idx < 1 or ans_idx > 4:
            errors.append({'line': i+6, 'reason': 'Answer index out of range (1-4)'})
            i += 6
            continue
        correct_answer = opts[ans_idx-1]
        # avoid duplicate by exact question text
        exists = dbs.query(models.Question).filter(models.Question.question_text == q_text, models.Question.is_task == False).first()
        if exists:
            skipped += 1
        else:
            try:
                q = models.Question(question_text=q_text, correct_answer=correct_answer, options=_json.dumps(opts), quest_id=1, is_task=False)
                dbs.add(q)
                dbs.commit()
                created += 1
            except Exception as e:
                dbs.rollback()
                errors.append({'line': i+1, 'reason': str(e)})
        i += 6

    dbs.close()
    return {'created': created, 'skipped': skipped, 'errors': errors}

