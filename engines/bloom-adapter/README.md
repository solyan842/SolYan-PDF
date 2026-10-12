# Bloom PDF → Office adapter

SolYan PDF does not vendor Bloom source into the core repository. The experimental PDF→Office adapter expects a separately deployed Bloom Document Intelligence Engine.

Pinned upstream reviewed for the current adapter:

- Repository: `stemlen/bloom-pdf-editor`
- Commit: `9ed16c43e356cffd4bd3b004b0dab19e582a59d5`
- License: Apache-2.0 at the reviewed revision
- API used:
  - `GET /health`
  - `POST /convert` multipart `file` + `target`
  - `GET /jobs/:id`
  - `GET /download/:id`
- Targets exposed by SolYan PDF: `docx`, `xlsx`, `pptx`

Configure the main backend with:

- `BLOOM_SERVICE_URL`
- `BLOOM_API_KEY` if the Bloom service enables API-key authentication

This integration remains **experimental** until representative Vietnamese/English documents are benchmarked for layout fidelity. It must not be presented as pixel-identical Office reconstruction.
