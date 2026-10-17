# SolYan PDF v0.1.9

SolYan PDF v0.1.9 delivers **V1.6 Hybrid / local-first PDF translation**, adding a validated free English -> Vietnamese translation route while preserving the project's Apache-2.0 core boundary and existing release gates.

## Highlights

- Added translated-only and bilingual PDF translation outputs.
- Added a free/local English -> Vietnamese route using Argos Translate.
- Pinned `argostranslate==1.11.0` and the EN -> VI model `translate-en_vi-1_9.argosmodel` with SHA-256 `86957101aa4099aa9a1a7492e41987d938d3cf0fdaf4fb684c0797a9d567dd16`.
- Added a small SolYan-owned OpenAI-compatible Argos bridge so the public `argos` provider can reuse PDFMathTranslate's existing provider interface without patching its broken first-party Argos path.
- Added server-side provider aliasing: the browser selects `argos`, while the external layout service receives `openailiked`; the implementation detail is never exposed as a browser provider.
- Kept provider API keys out of the browser. Optional OpenAI/DeepL/other cloud credentials remain deployment/operator configuration only.

## Architecture and licensing

PDFMathTranslate remains a **separately deployed AGPL-3.0 service** behind its HTTP task API. SolYan core does not vendor, import, subclass or patch the upstream source. V1.6 was audited against PDFMathTranslate commit `d16604dabb5c3f4c6d4daf37197b218b0dbd4df2` / CLI 1.9.12.

The validated free/local path is:

`SolYan FastAPI -> PDFMathTranslate Flask/Celery/Redis -> local OpenAI-compatible Argos bridge -> pinned EN -> VI model -> translated/bilingual PDF`

SolYan and the external translation stack run in isolated Python environments so their dependency graphs do not contaminate one another.

## Verification

V1.6 passed both live translation gates before release packaging:

- Provider-boundary run `38879155207`: PASS. Real mono and bilingual PDFs were generated through unmodified PDFMathTranslate and the local Argos bridge, with Vietnamese text checks.
- Full-stack run `38880970041`: PASS. The real SolYan FastAPI proxy successfully traversed PDFMathTranslate Flask/Celery/Redis and the local Argos bridge, returning HTTP 200 and a bilingual PDF.
- Full-stack artifact digest: `sha256:a2ee2127a60ab0d200797d3c98ae4eb6f32e1711e12a3e2157b57c746731c860`.
- Final extracted bilingual text retained the original English sentence and contained Vietnamese markers including `dịch`, `tiếng việt`, `trang`, `tài liệu`, and `xử lý`.
- The existing PDF -> Office V1 release gate remains unchanged at **27 cases / 68 source pages**.

## Important boundaries

- Argos is the free/local baseline; this release does not claim premium or universal translation accuracy.
- The `local` provider classification is deployment metadata, not packet-level proof of locality. Operators are responsible for keeping the bridge and external service on a trusted local/private network.
- Scan-heavy or image-only PDFs remain dependent on the external layout/OCR configuration. V1.6 does not silently inject SolYan OCR into the translation route.
- Optional cloud providers may send document text/content outside the SolYan deployment and require operator-side configuration.
- The pinned Argos model is downloaded and hash-verified in the external translation environment; it is not committed to this repository.

## Documentation

See `docs/V1.6-PDF-TRANSLATION.md` for the integration/security model and `docs/V1.6-CLOSEOUT.md` for the accepted scope and live evidence.
