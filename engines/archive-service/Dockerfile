FROM python:3.13-slim

ENV PYTHONUNBUFFERED=1
WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends qpdf tesseract-ocr tesseract-ocr-vie libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY app ./app

EXPOSE 8040
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8040", "--workers", "1"]
