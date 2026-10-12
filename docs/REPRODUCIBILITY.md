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

The following services have committed full transitive `requirements.lock` files generated in clean Python **3.13.16** virtual environments:

- `backend`
- `engines/office-service`
- `engines/sign-service`
- `engines/archive-service`

Regenerate them with:

```bash
PYTHON_BIN=/path/to/python3.13.16 ./scripts/lock-python-deps.sh
```

Docker and CI install both `requirements.lock` and the direct `requirements.txt` in one resolver invocation. This has two purposes:

1. transitive packages resolve to the exact committed versions;
2. if a direct requirement is changed without regenerating the lock, conflicting pins fail the build rather than silently drifting.

Every locked service also runs `pip check` after installation.

The PaddleOCR service is deliberately excluded from this lock set for now because PaddlePaddle is installed separately from its dedicated CPU wheel index. It requires a dedicated lock procedure that preserves the special index/source behavior rather than treating it as a normal PyPI-only service.

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

Artifacts are retained by GitHub Actions for 30 days. For a formal release, download and retain these artifacts with the release records or regenerate them from the exact release commit while package sources remain available.

## 5. What is still not bit-for-bit reproducible

Base-image pinning, npm/Python locks and inventory capture improve traceability, but they do not make the current build bit-for-bit reproducible because:

- Debian package installation still runs `apt-get update` against live repositories;
- distro packages are installed by package name rather than exact version;
- the PaddleOCR/PaddlePaddle service does not yet have a committed complete transitive lock;
- the Python lockfiles pin versions but do not yet use package hashes / `--require-hashes`;
- timestamps and build-tool metadata can differ between builds.

A stricter reproducible-build phase would use dated distro snapshots or exact package versions, hash-locked Python dependency sets, a dedicated Paddle CPU-index lock and normalized build metadata.

## 6. Release rule

Do not describe SolYan PDF containers as bit-for-bit reproducible until a repeat build of every release image has been verified to produce the intended deterministic result under the chosen reproducibility definition.

Until then, the accurate description is: **pinned base images + locked frontend graph + locked standard Python service graphs + recorded resolved image inventories**.
