# SolYan PDF v0.1.0 — Release Dependency Manifest

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
| qpdf | distro package | Apache-2.0 | CLI in backend/archive containers |
| iputils-ping | distro package | BSD/GPL-family package licensing; verify image package metadata at release build | CLI for network utility |

## OCR service

| Component | Version | License | Integration |
|---|---:|---|---|
| PaddlePaddle | 3.2.0 | Apache-2.0 | CPU inference runtime |
| PaddleOCR | 3.7.0 | Apache-2.0 | primary OCR/document intelligence |
| pytesseract | 0.3.13 | Apache-2.0 | Python adapter |
| pypdfium2 | 5.14.0 | BSD-3-Clause / Apache-2.0 plus bundled dependency notices | PDF rendering |
| Tesseract OCR | distro package | Apache-2.0 | fallback OCR binary |
| Vietnamese Tesseract data | distro package | upstream tessdata licensing applies | `vie` recognition data |

## Office service

| Component | Version | License | Integration |
|---|---:|---|---|
| FastAPI | 0.119.0 | MIT | Python runtime dependency |
| Uvicorn | 0.37.0 | BSD-3-Clause | Python runtime dependency |
| python-multipart | 0.0.20 | Apache-2.0 | Python runtime dependency |
| LibreOffice Writer/Calc/Impress | distro package | MPL-2.0 for LibreOffice plus separately licensed bundled code | isolated headless conversion service |
| DejaVu / Liberation fonts | distro package | respective font licenses | conversion fonts |

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
| pypdfium2 | >=4.30.0 | BSD-3-Clause / Apache-2.0 plus bundled dependency notices | PDF rendering |
| qpdf | distro package | Apache-2.0 | PDF engine |
| Tesseract OCR | distro package | Apache-2.0 | OCR engine |

## Optional / external

| Component | Version | License | Integration |
|---|---:|---|---|
| Bloom PDF Editor server | pinned deployment commit selected by operator | Apache-2.0 upstream; re-check exact commit/dependencies | optional external experimental PDF -> Office service |
| Google Custom Search API | external service | provider terms | optional keyword-position utility |
| Tranco-compatible ranking endpoint | external service | provider/API terms | optional website ranking utility |

## Reproducibility note

Application-level direct npm/Python dependencies and the Docker base-image indexes are pinned. However, the Dockerfiles still run `apt-get update` and install Debian packages without exact version constraints, and Python/npm transitive dependency graphs are not yet represented by a fully locked, hash-verified build manifest across all services.

Therefore the containers are **more reproducible but not yet bit-for-bit reproducible**. qpdf, LibreOffice, Tesseract, fonts and other distro packages can still change when repository metadata changes even though the Debian base image itself is fixed.

The next hardening step is to record the resolved OS/Python package inventory (SBOM) for built images and, where practical, pin release package versions or use a dated package snapshot.

## License compliance rule

Redistribution must preserve the SolYan PDF Apache-2.0 `LICENSE` and `NOTICE`, plus all third-party licenses/notices required by the distributed dependency set. This manifest is informational and does not replace upstream license texts.
