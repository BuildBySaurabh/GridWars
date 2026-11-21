FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .
RUN chmod +x scripts/start.sh \
    && useradd --create-home --uid 10001 app \
    && chown -R app:app /app
USER app

EXPOSE 8000
CMD ["./scripts/start.sh"]
