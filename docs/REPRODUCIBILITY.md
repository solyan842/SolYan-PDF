# SolYan PDF — Reproducibility and Image Inventory

SolYan PDF uses several layers of reproducibility rather than treating a Docker image tag as sufficient evidence of what was built.

## 1. Base-image identity

All release Dockerfiles pin OCI multi-architecture index digests:

- Node: `node:22.13-alpine@sha256:e2b39f7b64281324929257d0f8004fb6cb4bf0fdfb9aa8cedb235a766aec31da`
- Python: `python:3.13-slim@sha256:70729b46c69b4f1e97c4822c1af3df53a1476cf5ddc6c087c0c10bc3a5678c2f`

This prevents a mutable tag from silently selecting a different base image in a later build while preserving multi-architecture support.

## 2. Frontend dependency lock

`frontend/package-lock.json` is generated with Node 22.13 / npm 10.9 and committed to the repository. Both CI and the Docker dependency stage use `npm ci`, so the complete npm dependency graph comes from the lockfile instead of being re-resolved from semver ranges on every build.

The production audit remains a separate gate; a locked dependency can still become known-vulnerable later.

## 3. Python dependency locks

All five Python services have committed full transitive version locks generated in clean Python **3.13.16** environments:

- `backend`
- `engines/office-service`
- `engines/sign-service`
- `engines/archive-service`
- `engines/ocr-service`

Regenerate the version graphs with:

```bash
PYTHON_BIN=/path/to/python3.13.16 bash ./scripts/lock-python-deps.sh
```

The version-lock generator pins pip **26.2.1** so regeneration does not depend on an arbitrary latest pip release.

### Standard PyPI services: SHA-256 verification

Backend, Office, signing and PDF/A additionally commit `requirements.hashed.lock` files generated from their version locks with `scripts/hash-python-locks.sh`. The generator uses Python 3.13.16, pip 26.2.1 and pip-tools 7.6.2 with `--generate-hashes`.

Production Dockerfiles install these graphs with:

```text
pip install --require-hashes -r requirements.hashed.lock
```

They then validate the direct `requirements.txt` without resolving dependencies again and run `pip check`. `.github/workflows/hash-lock-ci.yml` regenerates all four hashed locks and fails if the committed output differs.

This prevents a same-version package artifact that does not match an accepted SHA-256 hash from entering those four production Python environments.

### OCR / Paddle special-index lock

The OCR service uses a two-part version lock because PaddlePaddle is distributed from a dedicated CPU wheel index:

- `engines/ocr-service/paddle-requirements.lock` pins `paddlepaddle==3.2.0` and preserves the official Paddle CPU index;
- `engines/ocr-service/requirements.lock` pins the rest of the PaddleOCR/Python transitive graph.

The OCR image installs the Paddle lock first, then the remaining version graph, validates direct requirements without re-resolving dependencies and finishes with `pip check`. This graph is version/source locked but is not yet covered by the standard PyPI hash-lock procedure.

## 4. Resolved package inventory

`.github/workflows/image-inventory-ci.yml` builds all six default images and uploads one inventory artifact per image:

- `frontend`
- `backend`
- `ocr-service`
- `office-service`
- `sign-service`
- `archive-service`

Each inventory captures, where present:

- Docker image ID, creation timestamp, architecture and size;
- `/etc/os-release`;
- all `dpkg` or `apk` packages with resolved versions;
- Python version and `pip freeze --all`;
- Node/npm versions and the production npm dependency tree;
- qpdf, Tesseract and LibreOffice version output.

The same workflow rejects images whose default runtime UID is root and verifies that the runtime HOME exists and is writable.

Artifacts are retained by GitHub Actions for 30 days. For a formal release, download and retain these artifacts with the release records or regenerate them from the exact release commit while package sources remain available.

## 5. What is still not bit-for-bit reproducible

Base-image pinning, npm/Python locks, standard-service SHA-256 verification and inventory capture improve traceability, but they do not make the current build bit-for-bit reproducible because:

- Debian package installation still runs `apt-get update` against live repositories;
- distro packages are installed by package name rather than exact version or dated snapshot;
- the OCR/Paddle dedicated-index dependency graph is version/source locked but not yet hash-verified;
- timestamps and build-tool metadata can differ between builds.

A stricter reproducible-build phase would use dated distro snapshots or exact package versions, extend hash verification to the Paddle CPU-index graph where reliable, and normalize build metadata.

## 6. Release rule

Do not describe SolYan PDF containers as bit-for-bit reproducible until a repeat build of every release image has been verified to produce the intended deterministic result under the chosen reproducibility definition.

Until then, the accurate description is: **pinned base images + locked frontend graph + locked Python graphs + SHA-256 verification for standard PyPI services + Paddle CPU-index source locking + recorded resolved image inventories**.
