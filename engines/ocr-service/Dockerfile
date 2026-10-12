FROM python:3.13-slim

ENV PYTHONUNBUFFERED=1 \
    FLAGS_use_mkldnn=0 \
    PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK=True \
    OCR_TESSERACT_FALLBACK=1 \
    TESSERACT_LANG=vie+eng

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 libgomp1 tesseract-ocr tesseract-ocr-vie tesseract-ocr-eng \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./requirements.txt
RUN python -m pip install --no-cache-dir --upgrade pip \
    && python -m pip install --no-cache-dir paddlepaddle==3.2.0 -i https://www.paddlepaddle.org.cn/packages/stable/cpu/ \
    && python -m pip install --no-cache-dir -r requirements.txt

COPY app ./app
EXPOSE 8010

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8010", "--workers", "1"]
