# SolYan OCR Service

Isolated PaddleOCR service for heavy OCR/document-intelligence workloads.

## Engine baseline

- PaddleOCR 3.7.0
- PaddlePaddle 3.2.0 CPU baseline
- PP-OCRv6 for text OCR
- PP-StructureV3 for structured document parsing

Models are lazy-loaded on first request so `/health` stays lightweight.

## Endpoints

- `GET /health`
- `POST /ocr/text` — image or PDF → OCR text + structured page JSON
- `POST /ocr/structured` — image or PDF → PP-StructureV3 JSON + Markdown where available

## Environment

- `OCR_LANG` defaults to `vi`
- `OCR_MAX_FILE_SIZE` defaults to 50 MB

The Docker image disables MKL-DNN by default for a more conservative CPU baseline. This can be overridden at deployment time after hardware-specific validation.
