from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from . import db, routers
import os

app = FastAPI(title="Birthday Raffle Quiz")


@app.on_event("startup")
def startup():
    db.init_database()


UPLOAD_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'uploads'))
os.makedirs(UPLOAD_DIR, exist_ok=True)
# serve uploaded files at /uploads
app.mount('/uploads', StaticFiles(directory=UPLOAD_DIR), name='uploads')

app.include_router(routers.api_router)
