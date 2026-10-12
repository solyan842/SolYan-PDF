FROM python:3.13-slim@sha256:70729b46c69b4f1e97c4822c1af3df53a1476cf5ddc6c087c0c10bc3a5678c2f

ENV PYTHONUNBUFFERED=1 \
    HOME=/home/solyan \
    FLAGS_use_mkldnn=0 \
    PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK=True \
    OCR_TESSERACT_FALLBACK=1 \
    TESSERACT_LANG=vie+eng

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 libgomp1 tesseract-ocr tesseract-ocr-vie tesseract-ocr-eng \
    && groupadd --system solyan \
    && useradd --system --gid solyan --create-home --home-dir /home/solyan solyan \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt requirements.lock paddle-requirements.lock ./
RUN python -m pip install --no-cache-dir pip==26.2.1 \
    && python -m pip install --no-cache-dir -r paddle-requirements.lock \
    && python -m pip install --no-cache-dir -r requirements.lock \
    && python -m pip install --no-cache-dir --no-deps -r requirements.txt \
    && python -m pip check

COPY app ./app
RUN chown -R solyan:solyan /app /home/solyan
USER solyan
EXPOSE 8010

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8010", "--workers", "1"]
