# SolYan PDF — Reproducibility and Image Inventory

SolYan PDF uses several layers of reproducibility rather than treating a Docker image tag as sufficient evidence of what was built.

## 1. Base-image identity

All release Dockerfiles pin OCI multi-architecture index digests:

- Node: `node:22.13-alpine@sha256:e2b39f7b64281324929257d0f8004fb6cb4bf0fdfb9aa8cedb235a766aec31da`
- Python: `python:3.13-slim@sha256:70729b46c69b4f1e97c4822c1af3df53a1476cf5ddc6c087c0c10bc3a5678c2f`

This prevents a mutable tag from silently selecting a different base image in a later build while preserving multi-architecture support.

## 2. Debian package snapshot

All five Python/Debian images replace live Debian mirrors with the fixed snapshot ID **`20261012T000000Z`**:

- `https://snapshot.debian.org/archive/debian/20261012T000000Z/`
- `https://snapshot.debian.org/archive/debian-security/20261012T000000Z/`

The sources use `trixie`, `trixie-updates` and `trixie-security`, retain Debian archive signature verification, and set `Check-Valid-Until: no` because historical snapshots intentionally stop moving.

This means a later build does not silently select a newer qpdf, Tesseract, LibreOffice, system library or font merely because Debian mirrors advanced. Image Inventory CI verifies the snapshot URLs inside every Debian image and fails if `deb.debian.org` remains configured.

The frontend image has no `apk add` step; its OS userspace is supplied entirely by the pinned Alpine base-image digest.

## 3. Frontend dependency lock

`frontend/package-lock.json` is generated with Node 22.13 / npm 10.9 and committed to the repository. Both CI and the Docker dependency stage use `npm ci`, so the complete npm dependency graph comes from the lockfile instead of being re-resolved from semver ranges on every build.

The production audit remains a separate gate; a locked dependency can still become known-vulnerable later.

## 4. Python dependency locks

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

Backend, Office, signing and PDF/A commit `requirements.hashed.lock` files generated from their version locks with `scripts/hash-python-locks.sh`. The generator uses Python 3.13.16, pip 26.2.1 and pip-tools 7.6.2 with `--generate-hashes`.

Production Dockerfiles install these graphs with:

```text
pip install --require-hashes -r requirements.hashed.lock
```

They then validate the direct `requirements.txt` without resolving dependencies again and run `pip check`.

### OCR: hash-verified PyPI graph + source-locked PaddlePaddle

PaddlePaddle is distributed from a dedicated CPU wheel index, so OCR keeps it separate from the ordinary PyPI graph:

- `engines/ocr-service/paddle-requirements.lock` pins `paddlepaddle==3.2.0` and preserves the official Paddle CPU index;
- `engines/ocr-service/requirements.lock` pins the remaining PaddleOCR/Python transitive graph;
- `engines/ocr-service/requirements.hashed.lock` records every published SHA-256 distribution digest for each exact PyPI release in that graph.

`scripts/hash-pinned-pypi.py` queries PyPI metadata for the already-pinned versions and generates the multi-platform hash set without resolving dependencies again. The OCR image installs PaddlePaddle first from its dedicated CPU source, then installs the remaining PyPI graph with:

```text
pip install --require-hashes --no-deps -r requirements.hashed.lock
```

The `--no-deps` boundary is deliberate: it prevents pip from attempting to re-resolve PaddlePaddle from PyPI while still requiring every explicitly listed PyPI artifact to match an accepted SHA-256 digest. The image finishes with `pip check` to verify that the separately sourced PaddlePaddle and the hash-verified PyPI graph satisfy the complete dependency relationships.

`.github/workflows/hash-lock-ci.yml` regenerates all standard and OCR PyPI hash locks and fails on drift.

## 5. Resolved package inventory

`.github/workflows/image-inventory-ci.yml` builds all six default images and uploads one inventory artifact per image:

- `frontend`
- `backend`
- `ocr-service`
- `office-service`
- `sign-service`
- `archive-service`

Each inventory captures, where present:

- Docker image ID, creation timestamp, architecture, size and image labels;
- `/etc/os-release`;
- configured APT sources;
- all `dpkg` or `apk` packages with resolved versions;
- Python version and `pip freeze --all`;
- Node/npm versions and the production npm dependency tree;
- qpdf, Tesseract and LibreOffice version output.

The same workflow rejects images whose default runtime UID is root, verifies that the runtime HOME exists and is writable, and verifies the fixed Debian snapshot configuration on Debian images.

Artifacts are retained by GitHub Actions for 30 days. For a formal release, download and retain these artifacts with the release records or regenerate them from the exact release commit while package sources remain available.

## 6. What is still not bit-for-bit reproducible

Base-image pinning, Debian snapshot pinning, npm/Python locks, PyPI SHA-256 verification and inventory capture substantially reduce external resolver drift. SolYan PDF still does **not** claim bit-for-bit image reproducibility because:

- the PaddlePaddle wheel from its dedicated CPU index is source/version locked but not yet hash-pinned across all supported architectures;
- build timestamps and some generated metadata can differ between builds;
- repeat-build byte identity across every image/architecture has not been established as a release invariant.

A stricter final reproducible-build phase would establish a reliable architecture-aware PaddlePaddle wheel hash policy and normalize build metadata, then compare repeat-build image outputs under a defined reproducibility policy.

## 7. Release rule

Do not describe SolYan PDF containers as bit-for-bit reproducible until a repeat build of every release image has been verified to produce the intended deterministic result under the chosen reproducibility definition.

Until then, the accurate description is: **pinned base-image digests + fixed Debian package snapshot + locked frontend/Python graphs + SHA-256 verification for all ordinary PyPI dependencies including OCR + Paddle CPU-index source/version locking + recorded resolved image inventories**.
