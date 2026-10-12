FROM python:3.13-slim@sha256:70729b46c69b4f1e97c4822c1af3df53a1476cf5ddc6c087c0c10bc3a5678c2f

ENV PYTHONUNBUFFERED=1 \
    HOME=/home/solyan
WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends qpdf tesseract-ocr tesseract-ocr-vie libgomp1 \
    && groupadd --system solyan \
    && useradd --system --gid solyan --create-home --home-dir /home/solyan solyan \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.hashes ./
RUN pip install --no-cache-dir --require-hashes -r requirements.hashes \
    && pip check
COPY app ./app
RUN chown -R solyan:solyan /app /home/solyan

USER solyan
EXPOSE 8040
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8040", "--workers", "1"]
