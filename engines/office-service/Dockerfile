FROM python:3.13-slim@sha256:70729b46c69b4f1e97c4822c1af3df53a1476cf5ddc6c087c0c10bc3a5678c2f

ENV PYTHONUNBUFFERED=1 \
    HOME=/home/solyan
WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends libreoffice-writer libreoffice-calc libreoffice-impress fonts-dejavu-core fonts-liberation \
    && groupadd --system solyan \
    && useradd --system --gid solyan --create-home --home-dir /home/solyan solyan \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt requirements.lock requirements.hashed.lock ./
RUN python -m pip install --no-cache-dir --require-hashes -r requirements.hashed.lock \
    && python -m pip install --no-cache-dir --no-deps -r requirements.txt \
    && python -m pip check
COPY app ./app
RUN chown -R solyan:solyan /app /home/solyan

USER solyan
EXPOSE 8020
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8020", "--workers", "1"]
