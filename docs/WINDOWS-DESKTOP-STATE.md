# SolYan PDF Windows Desktop — Active State

Status: **ACTIVE / DO NOT DROP**
Active implementation branch: `feat/windows-desktop-d4-ocr`
Merged Windows baseline: `main` commit `5a5095ed65106359c11c84d8cdcce9948adcaf85`

This is the rolling handoff for the Windows desktop lane. Repository state and current exact-head CI always override this file when HEAD advances.

## Locked product direction

Read first:

- `AGENTS.md`
- `docs/WINDOWS-DESKTOP-V1.md`
- `docs/WINDOWS-DESKTOP-UX-LOCK.md`

Do not restart Windows-vs-web, Tauri-vs-Electron, or macOS-style design discussions unless new evidence creates a real product decision. Windows-first, Windows 11 Fluent/native behavior, the accepted premium visual demo, and iLovePDF-style discoverability are already approved.

## Continuation rule — DO NOT DROP

- `ok`, `tiếp`, `tiếp tục` means continue the agreed Windows implementation automatically.
- Keep working through normal engineering choices and CI iterations without asking again.
- Stop only for a genuine product decision, credentials/permissions, a destructive/materially irreversible choice, or a hard tool boundary.
- Do not leave catalog cards as demo-only placeholders when an existing local backend route can be wired safely.
- Do not hide common tools behind deep menus; Home/search/category navigation remain the UX source of truth.

## D1 / D2 — Windows shell and local core — PASS

- Tauri 2 Windows shell, NSIS current-user installer, `.pdf` association, strict CSP and Windows lifecycle behavior are established.
- Existing `backend.app.main` remains the desktop core source of truth; no desktop API fork.
- Authenticated loopback core uses a random per-launch `X-SolYan-Desktop-Token`.
- qpdf Windows x64 `12.4.2` and Poppler Windows x64 `26.09.0-0` are pinned/bundled.
- Windows Job Objects use `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`; installed-runtime smoke rejects orphan processes.
- Native qpdf/Poppler tools, security/inspection tools, attachments, remove annotations/forms/signatures/images, blank-page removal, page labels, Portfolio and Poppler converters are already wired and have green Windows baselines.

## D3 — Office runtime / conversion — MERGED / PASS

- LibreOffice `26.8.1` x64 is pinned and bundled with standalone `solyan-office.exe`.
- Tauri supervises Office and core locally; core receives `OFFICE_SERVICE_URL` automatically.
- Office → PDF UI is wired for Word, Excel, PowerPoint, OpenDocument and RTF.
- PDF → Word / PowerPoint uses `/experimental/pdf-to-office` with `mode=auto`, preserving LibreOffice-first → Bloom fallback.
- XLSX source-of-truth remains Bloom → PP-StructureV3 fallback; desktop does not pretend Bloom is locally bundled.
- PR #134 merged to `main` as `5a5095ed65106359c11c84d8cdcce9948adcaf85`.
- Exact post-merge main verification: **0 failure / 0 in-progress / 0 queued**.

## Locked PDF→Office release gate — PASS

Permanent policy: `benchmarks/corpora/pdf_to_office_release_v1.json`.

- Synthetic: **18 / 18 cases PASS**.
- Real corpus: **9 / 9 cases / 50 pages PASS**.
- Combined release gate: **27 cases / 68 source pages PASS**.
- Synthetic baseline observed approximately 97.78% mean similarity, minimum 94.23%.
- DOCX/PPTX routing remains LibreOffice-first → Bloom fallback.
- XLSX routing remains Bloom → PP-StructureV3 fallback.
- Do not weaken this policy merely to make later runs green.

## D4 — Windows OCR runtime

### D4A — standalone Windows OCR sidecar — PASS

Exact evidence:

- branch head: `c4d0f93961f20a822f362c237d175e9da8c217ee`
- Windows OCR Runtime CI run: `39059428876` — PASS
- Python 3.13 / Windows x64
- PaddlePaddle `3.2.0`
- PaddleOCR `3.7.0`
- PaddleX `3.7.2`
- `solyan-ocr.exe` boots on loopback and `/health` stays lazy: neither Paddle pipeline loads just by starting the service.

Pinned Tesseract fallback:

- Tesseract `5.5.3`, build `5.5.3.20260724`
- installer SHA-256 `bee9e3434bd94fd65387d9be28cd467a41f61b1275383b55b0f59a1331270ae4`
- pinned `vie`, `eng`, `osd` tessdata from immutable `tessdata_fast` commit `65727574dfcd264acbb0c3e07860e4e9e9b22185`
- real Tesseract smoke PASS.

### D4B — fully offline Paddle text OCR — PASS

Exact evidence:

- exact head: `2cab13d51c0f2d5a4da72713942782d882da7455`
- Windows OCR Runtime CI run: `39063930509` — PASS
- diagnostic artifact: `windows-ocr-runtime-diagnostics` / artifact `12112392911`
- network proxy deliberately pointed to dead `127.0.0.1:9` during the OCR request
- `/ocr/text` returned `engine=PaddleOCR`
- `fallback_used=false`
- recognized `SOLYAN PDF 2026`
- post-request health: `models_loaded.ocr=true`, `models_loaded.structure=false`
- packaged sidecar size observed: `292146971` bytes.

Pinned Paddle text cache uses official PaddleX `PADDLE_PDX_CACHE_HOME/official_models/<model>` layout and verifies size + SHA-256 before extraction. Exact five-model set:

1. `PP-LCNet_x1_0_doc_ori`
2. `UVDoc`
3. `PP-LCNet_x1_0_textline_ori`
4. `PP-OCRv6_medium_det`
5. `PP-OCRv6_medium_rec`

Combined text-model archive size: `185139200` bytes (~176.6 MiB).

PyInstaller note: PaddleX determines optional OCR availability through `importlib.metadata`; therefore the Windows sidecar must preserve PaddleX metadata plus explicit metadata for the six `ocr-core` dependencies. Do not remove these metadata flags without a frozen-sidecar regression proving it is safe.

### D4C — PP-StructureV3 offline model set — HASHED / PACKAGING DECISION PENDING

The exact PaddleX `3.7.2` PP-StructureV3 configuration was audited. The full current semantics keep table recognition, formula recognition and region detection enabled.

Ten additional official inference model archives were downloaded and SHA-256 measured on isolated probe branch. Combined archive size is **1,805,516,800 bytes (~1.72 GiB)** before extraction/installer overhead.

Largest contributors:

- `PP-FormulaNet_plus-L`: `731504640` bytes (~697.6 MiB)
- `SLANeXt_wired`: `365742080` bytes (~348.8 MiB)

All ten exact hashes/sizes are captured in the probe branch script `desktop/backend/stage-ocr-structure-models.ps1`; commit `b96b25de3dde899b7a86f011397e66801f54b0f0`.

Important boundary: the pre-OCR Windows NSIS installer was already `382187087` bytes (~364 MiB), the OCR sidecar is ~292 MiB, the five text models are ~176.6 MiB, and the full PP-StructureV3 model archives add ~1.72 GiB. A monolithic full bundle therefore risks/exceeds the practical ~2 GiB NSIS/WiX boundary and should not be chosen silently.

Recommended product direction when this decision is requested: keep base/text OCR local in the normal installer, and make PP-StructureV3 an **automatic one-time Advanced OCR model pack** downloaded from the pinned official Paddle URLs, SHA-256 verified, stored in the local PaddleX cache, then usable offline. The user should not have to manually find or install a model pack.

Do not silently disable formula/region/table models merely to shrink the installer; that changes OCR semantics and requires a product/quality decision plus new benchmarks.

## D4 desktop integration — IMPLEMENTED, exact-head Windows installer CI pending

- OCR text integration is being validated on the dedicated D4 branch.
- Bundles pinned Tesseract + offline Paddle text models + PyInstaller OCR sidecar in NSIS.
- Tauri supervises Office, OCR and Core with Windows Job Objects; core receives loopback `OCR_SERVICE_URL`.
- `OCR PDF` and `OCR ảnh` open a simple single-file text extraction screen, reusing the existing `/ocr/text` API.
- **Do not mark D4 installer PASS until exact-head NSIS, silent-install, OCR spawn and cleanup smoke pass.**

## D4 next work — continue automatically until the packaging decision blocks it

1. Integrate D4A/D4B text OCR resources into the normal Windows installer: `solyan-ocr.exe`, Tesseract + `vie/eng/osd`, and the five pinned text models.
2. Extend Tauri supervisor from Office → Core to Office → OCR → Core and inject `OCR_SERVICE_URL` into core.
3. Extend installed-runtime smoke to prove OCR sidecar appears and is cleaned up with the app.
4. Wire the existing OCR catalog cards to a simple Windows UI using existing `/ocr/*` proxy routes; do not invent a parallel desktop OCR API.
5. Keep PP-StructureV3/structured OCR/scan-table/Markdown/CSV behind the genuine packaging decision above until the distribution strategy is approved.
6. Update this state file in the same meaningful implementation commit/run; do not create repetitive docs-only churn.

Stop only when the PP-StructureV3 packaging choice becomes the actual next blocker, or another genuine decision/credential/hard boundary appears.
