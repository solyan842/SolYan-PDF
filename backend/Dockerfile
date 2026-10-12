FROM python:3.13-slim@sha256:70729b46c69b4f1e97c4822c1af3df53a1476cf5ddc6c087c0c10bc3a5678c2f

ARG DEBIAN_SNAPSHOT=20261012T000000Z
LABEL org.solyan.debian-snapshot="${DEBIAN_SNAPSHOT}"

RUN rm -f /etc/apt/sources.list \
    && printf '%s\n' \
      'Types: deb' \
      "URIs: https://snapshot.debian.org/archive/debian/${DEBIAN_SNAPSHOT}/" \
      'Suites: trixie trixie-updates' \
      'Components: main' \
      'Signed-By: /usr/share/keyrings/debian-archive-keyring.gpg' \
      'Check-Valid-Until: no' \
      '' \
      'Types: deb' \
      "URIs: https://snapshot.debian.org/archive/debian-security/${DEBIAN_SNAPSHOT}/" \
      'Suites: trixie-security' \
      'Components: main' \
      'Signed-By: /usr/share/keyrings/debian-archive-keyring.gpg' \
      'Check-Valid-Until: no' \
      > /etc/apt/sources.list.d/debian.sources \
    && apt-get -o Acquire::Retries=3 update \
    && apt-get install -y --no-install-recommends qpdf iputils-ping \
    && groupadd --system solyan \
    && useradd --system --gid solyan --create-home --home-dir /home/solyan solyan \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt requirements.lock requirements.hashed.lock ./
RUN python -m pip install --no-cache-dir --require-hashes -r requirements.hashed.lock \
    && python -m pip install --no-cache-dir --no-deps -r requirements.txt \
    && python -m pip check
COPY app ./app
RUN chown -R solyan:solyan /app /home/solyan

ENV PYTHONUNBUFFERED=1 \
    HOME=/home/solyan
USER solyan
EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
