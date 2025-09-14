FROM python:3.11-slim
WORKDIR /app

# Install system deps for psycopg2
RUN apt-get update && apt-get install -y build-essential libpq-dev gcc --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN python -m pip install --upgrade pip setuptools
RUN pip install --no-cache-dir -r requirements.txt

COPY . /app

ENV PYTHONUNBUFFERED=1
ENV CREATE_TABLES=1

EXPOSE 8000
# Launch script will decide whether to use SSL based on env vars
COPY start-uvicorn.sh /start-uvicorn.sh
RUN chmod +x /start-uvicorn.sh
CMD ["/start-uvicorn.sh"]
