# SolYan PDF v0.1.1 — Release Dependency Manifest

Release date: 2026-10-12

Project license: **Apache-2.0** (`LICENSE`)

This manifest records the main directly declared runtime dependencies and system engines used by the default V1 stack. Transitive dependencies remain governed by their own licenses.

## Container base images

The Dockerfiles are pinned to OCI multi-architecture index digests so future builds cannot silently move to a different base image while retaining the same tag.

| Base image | Pinned digest | Resolved image line |
|---|---|---|
| `node:22.13-alpine` | `sha256:e2b39f7b64281324929257d0f8004fb6cb4bf0fdfb9aa8cedb235a766aec31da` | Node 22.13 / Alpine 3.21 |
| `python:3.13-slim` | `sha256:70729b46c69b4f1e97c4822c1af3df53a1476cf5ddc6c087c0c10bc3a5678c2f` | Python 3.13.16 / Debian Trixie slim |

The multi-arch index digest is intentionally used instead of an amd64-only manifest digest, preserving Docker's architecture selection for supported platforms.

## Debian package snapshot

All five Python/Debian images use the fixed Debian snapshot ID **`20261012T000000Z`** for both the main Debian archive and `debian-security`. Their deb822 sources point to `snapshot.debian.org`, use `trixie`, `trixie-updates` and `trixie-security`, and set `Check-Valid-Until: no` as required for historical snapshot use.

Image Inventory CI rejects Debian runtime images that no longer contain the expected snapshot URLs or that still reference `deb.debian.org`. The snapshot timestamp is also recorded as an image label.

The frontend image uses the already-pinned Alpine base image and performs no `apk add`, so there is no additional live Alpine package-resolution step in the frontend Dockerfile.

## Dependency lock coverage

| Runtime | Lock state |
|---|---|
| Frontend | Full npm graph committed in `frontend/package-lock.json`; Docker/CI use `npm ci` |
| Backend | Version graph in `requirements.lock`; distribution hashes in `requirements.hashed.lock`; production uses `pip --require-hashes` |
| Office service | Version graph in `requirements.lock`; distribution hashes in `requirements.hashed.lock`; production uses `pip --require-hashes` |
| Signature service | Version graph in `requirements.lock`; distribution hashes in `requirements.hashed.lock`; production uses `pip --require-hashes` |
| PDF/A archive service | Version graph in `requirements.lock`; distribution hashes in `requirements.hashed.lock`; production uses `pip --require-hashes` |
| OCR service | PaddlePaddle 3.2.0 stays in `paddle-requirements.lock` on the official CPU index; every ordinary PyPI package in the remaining OCR graph is version-locked and SHA-256 hash-verified in `requirements.hashed.lock` |

Version lockfiles are generated in a clean Python 3.13.16 environment by `scripts/lock-python-deps.sh` with pip 26.2.1 pinned for lock generation. Standard-service hash locks are generated from those committed version graphs by `scripts/hash-python-locks.sh` with pip-tools 7.6.2.

For OCR, `scripts/hash-pinned-pypi.py` records every published SHA-256 distribution digest for the exact versions already present in the OCR PyPI graph. Production installs PaddlePaddle first from its dedicated CPU source, then installs the ordinary PyPI graph with `pip --require-hashes --no-deps`, and finishes with `pip check`. This preserves the explicit Paddle source boundary while preventing unapproved PyPI artifacts from entering the OCR environment.

`.github/workflows/hash-lock-ci.yml` regenerates the standard and OCR PyPI hash files and fails if committed output drifts.

## Frontend

| Component | Version | License | Integration |
|---|---:|---|---|
| Next.js | 15.5.27 | MIT | bundled npm runtime |
| React | 19.1.1 | MIT | bundled npm runtime |
| React DOM | 19.1.1 | MIT | bundled npm runtime |
| pdf-lib | 1.17.1 | MIT | bundled browser PDF engine |
| pdfjs-dist / PDF.js | 6.4.299 | Apache-2.0 | bundled browser viewer/rendering engine |
| JSZip | 3.10.2 | MIT | bundled browser ZIP engine |
| PostCSS override | 8.5.29 | MIT | transitive security override |

## Backend orchestration

| Component | Version | License | Integration |
|---|---:|---|---|
| FastAPI | 0.119.0 | MIT | Python runtime dependency |
| Uvicorn | 0.37.0 | BSD-3-Clause | Python runtime dependency |
| python-multipart | 0.0.20 | Apache-2.0 | Python runtime dependency |
| httpx | 0.28.1 | BSD-3-Clause | Python runtime dependency |
| qpdf | snapshot-resolved distro package | Apache-2.0 | CLI in backend/archive containers |
| iputils-ping | snapshot-resolved distro package | BSD/GPL-family package licensing; verify image package metadata at release build | CLI for network utility |

## OCR service

| Component | Version | License | Integration |
|---|---:|---|---|
| PaddlePaddle | 3.2.0 | Apache-2.0 | CPU inference runtime; dedicated CPU-index source/version lock |
| PaddleOCR | 3.7.0 | Apache-2.0 | primary OCR/document intelligence; PyPI artifact hash-verified |
| pytesseract | 0.3.13 | Apache-2.0 | Python adapter; PyPI artifact hash-verified |
| pypdfium2 | 5.14.0 | BSD-3-Clause / Apache-2.0 plus bundled dependency notices | PDF rendering; PyPI artifact hash-verified |
| Tesseract OCR | snapshot-resolved distro package | Apache-2.0 | fallback OCR binary |
| Vietnamese Tesseract data | snapshot-resolved distro package | upstream tessdata licensing applies | `vie` recognition data |

## Office service

| Component | Version | License | Integration |
|---|---:|---|---|
| FastAPI | 0.119.0 | MIT | Python runtime dependency |
| Uvicorn | 0.37.0 | BSD-3-Clause | Python runtime dependency |
| python-multipart | 0.0.20 | Apache-2.0 | Python runtime dependency |
| LibreOffice Writer/Calc/Impress | snapshot-resolved distro package | MPL-2.0 for LibreOffice plus separately licensed bundled code | isolated headless conversion service |
| DejaVu / Liberation fonts | snapshot-resolved distro package | respective font licenses | conversion fonts |

## Signature service

| Component | Version | License | Integration |
|---|---:|---|---|
| FastAPI | 0.119.0 | MIT | Python runtime dependency |
| Uvicorn | 0.37.0 | BSD-3-Clause | Python runtime dependency |
| python-multipart | 0.0.20 | Apache-2.0 | Python runtime dependency |
| pyHanko | 0.37.0 | MIT | PDF cryptographic signing |

## PDF/A archive service

| Component | Version | License | Integration |
|---|---:|---|---|
| FastAPI | 0.119.0 | MIT | Python runtime dependency |
| Uvicorn | 0.37.0 | BSD-3-Clause | Python runtime dependency |
| python-multipart | 0.0.20 | Apache-2.0 | Python runtime dependency |
| OCRmyPDF | 17.13.0 | MPL-2.0 | PDF/A orchestration |
| pypdfium2 | 5.14.0 in transitive lock | BSD-3-Clause / Apache-2.0 plus bundled dependency notices | PDF rendering |
| qpdf | snapshot-resolved distro package | Apache-2.0 | PDF engine |
| Tesseract OCR | snapshot-resolved distro package | Apache-2.0 | OCR engine |

## Optional / external

| Component | Version | License | Integration |
|---|---:|---|---|
| Bloom PDF Editor server | pinned deployment commit selected by operator | Apache-2.0 upstream; re-check exact commit/dependencies | optional external experimental PDF -> Office service |
| Google Custom Search API | external service | provider terms | optional keyword-position utility |
| Tranco-compatible ranking endpoint | external service | provider/API terms | optional website ranking utility |

## Resolved image inventory

`.github/workflows/image-inventory-ci.yml` builds all six default images and stores a 30-day artifact for each image. The artifact records Docker metadata/labels, APT sources where applicable, the resolved OS package list, Python/npm dependency graph, and core binary versions. The same workflow rejects root runtime users, verifies a writable runtime HOME, and enforces the pinned Debian snapshot on all Debian images.

See `docs/REPRODUCIBILITY.md` for the exact inventory/lock model and limitations.

## Reproducibility note

Application-level npm and Python dependency graphs are version-locked. All ordinary PyPI distributions — including the OCR/PaddleOCR graph except the separately sourced PaddlePaddle wheel itself — are SHA-256 hash-verified. Docker base-image indexes are pinned, Debian OS-package resolution uses a fixed snapshot, and resolved image inventories are captured by CI.

The containers are still **not claimed bit-for-bit reproducible** because the PaddlePaddle wheel from its dedicated CPU index is source/version locked rather than architecture-wide hash-pinned, and timestamps/build-tool metadata can vary. Repeat-build byte identity has not been established as a release guarantee.

## License compliance rule

Redistribution must preserve the SolYan PDF Apache-2.0 `LICENSE` and `NOTICE`, plus all third-party licenses/notices required by the distributed dependency set. This manifest is informational and does not replace upstream license texts.
