import json
from pathlib import Path

VERSION = "0.1.7"
DATE = "2026-10-15"

package_path = Path("frontend/package.json")
package = json.loads(package_path.read_text())
assert package["version"] == "0.1.6", package["version"]
package["version"] = VERSION
package_path.write_text(json.dumps(package, ensure_ascii=False, indent=2) + "\n")

lock_path = Path("frontend/package-lock.json")
lock = json.loads(lock_path.read_text())
assert lock["version"] == "0.1.6", lock["version"]
assert lock["packages"][""]["version"] == "0.1.6", lock["packages"][""]["version"]
lock["version"] = VERSION
lock["packages"][""]["version"] = VERSION
lock_path.write_text(json.dumps(lock, ensure_ascii=False, indent=2) + "\n")

backend_path = Path("backend/app/main.py")
backend = backend_path.read_text()
old = 'app = FastAPI(title="SolYan PDF API", version="0.1.6")'
new = 'app = FastAPI(title="SolYan PDF API", version="0.1.7")'
assert old in backend
backend_path.write_text(backend.replace(old, new, 1))

changelog_path = Path("CHANGELOG.md")
changelog = changelog_path.read_text()
anchor = "## [Unreleased]\n"
assert changelog.count(anchor) == 1
section = """## [0.1.7] - 2026-10-15

Patch release completing the **V1.4 OSS-first self-contained security, scan-simulation and vector-export pass**.

### V1.4 self-contained tools
- Added Auto Redact Text with literal PDF.js text-layer matching and security-first raster replacement only on pages containing matches.
- Added deterministic Scanner Effect with bounded DPI presets, grayscale/color output, brightness/contrast, seeded noise, blur, paper yellowing, border and skew simulation.
- Added PDF -> PostScript / EPS through the already-shipped Poppler `pdftops` engine: multi-page PS, single-page EPS, Level 2/3, page ranges and password support.

### Verification and architecture
- Added dedicated exact-head regressions for Auto Redact Text, Scanner Effect and PDF -> PostScript / EPS; all pull-request-triggered regressions on the final feature heads passed before merge.
- Auto Redact security coverage requires the secret to disappear from both `pdftotext` output and expanded QDF reachable content while text on untouched pages remains extractable.
- Reused PDF.js, Canvas, pdf-lib and Poppler already present in the stack; V1.4 adds no new application runtime or provider dependency.
- Closed the accepted scope in `docs/V1.4-PARITY-AUDIT.md` and `docs/V1.4-CLOSEOUT.md` rather than extending parity merely to increase tool count.

### Important boundaries
- Auto Redact operates on the existing PDF text layer; image-only scans must be OCRed first. Affected pages are rasterized and lose original interactive/vector structures.
- Scanner Effect is a visual simulation only, not OCR and not evidence of physical-scanner provenance; output is intentionally rasterized.
- PostScript is an executable page-description language for an interpreter. SolYan only generates PS/EPS and does not accept/execute uploaded PostScript in this feature.
- PDF -> EPUB/AZW3, PCL/XPS, CBR/RAR tooling and inline content-stream image removal remain deliberate dependency/parser expansion decisions.
- Multi-party remote signing, cloud connectors, AI summarization and PDF translation remain separate provider/product/credential decisions.

"""
changelog_path.write_text(changelog.replace(anchor, anchor + "\n" + section, 1))

manifest_path = Path("docs/RELEASE-MANIFEST.md")
manifest = manifest_path.read_text()
assert "# SolYan PDF v0.1.6 — Release Dependency Manifest" in manifest
assert "Release date: 2026-10-15" in manifest
manifest = manifest.replace("# SolYan PDF v0.1.6 — Release Dependency Manifest", "# SolYan PDF v0.1.7 — Release Dependency Manifest", 1)
manifest = manifest.replace("Release date: 2026-10-15", f"Release date: {DATE}", 1)
manifest = manifest.replace(
    "separate CLI tools (`pdfimages`, `pdftotext`, `pdftoppm`) for image extraction and bounded blank-page analysis",
    "separate CLI tools (`pdfimages`, `pdftotext`, `pdftoppm`, `pdftops`) for image extraction, text/blank-page analysis and PS/EPS vector export",
    1,
)
manifest_path.write_text(manifest)

readme_path = Path("README.md")
readme = readme_path.read_text()
color_anchor = "- Explicit rasterized Color Transform: invert, grayscale, high-contrast and custom two-color output\n"
assert color_anchor in readme
additions = (
    "- Auto Redact Text: literal PDF.js text-layer matching with security-first raster replacement only on affected pages\n"
    "- Deterministic Scanner Effect with bounded DPI/noise/blur/yellowing/border/skew presets\n"
)
if "Auto Redact Text: literal PDF.js text-layer matching" not in readme:
    readme = readme.replace(color_anchor, color_anchor + additions, 1)
conversion_anchor = "- PDF -> PNG/JPEG ZIP in the browser\n"
assert conversion_anchor in readme
postscript_line = "- PDF -> PostScript / EPS through Poppler `pdftops`, with multi-page PS, single-page EPS and Level 2/3 support\n"
if postscript_line not in readme:
    readme = readme.replace(conversion_anchor, conversion_anchor + postscript_line, 1)
old_parity = "The current V1.2 maintained-OSS parity decisions are recorded in `docs/V1.2-PARITY-AUDIT.md`."
new_parity = "The maintained-OSS parity decisions through the closed V1.4 self-contained scope are recorded in `docs/V1.2-PARITY-AUDIT.md`, `docs/V1.3-PARITY-AUDIT.md` and `docs/V1.4-PARITY-AUDIT.md`."
assert old_parity in readme
readme = readme.replace(old_parity, new_parity, 1)
readme_path.write_text(readme)

roadmap_path = Path("docs/ROADMAP.md")
roadmap = roadmap_path.read_text()
roadmap_anchor = "## Tiện ích Việt Nam — V1\n"
assert roadmap_anchor in roadmap
release_sections = """## V1.3 — OSS-first self-contained converter expansion

- [x] Remove digital signatures while preserving ordinary AcroForm fields
- [x] Add bounded PDF Inspector / Get ALL Info and unlock read-only form fields
- [x] Split scanner-bed photographs with the existing PDFium/OpenCV stack
- [x] Add PDF → HTML, Text, CBZ, Markdown, XML, RTF and CSV using existing engines
- [x] Add UTF-8 TXT → PDF through the existing LibreOffice Office service
- [x] Close and release the self-contained V1.3 scope as v0.1.6

V1.3 is complete. Detailed engine decisions and boundaries are in `docs/V1.3-PARITY-AUDIT.md` and `docs/V1.3-CLOSEOUT.md`.

## V1.4 — Security, scan simulation and vector export

- [x] Add Auto Redact Text with security-first affected-page raster replacement and non-disclosure regression coverage
- [x] Add deterministic browser-local Scanner Effect with bounded scan-simulation presets
- [x] Add PDF → PostScript / EPS through existing Poppler `pdftops`, without adding Ghostscript
- [x] Re-audit maintained OSS and Vietnamese utilities; do not add low-value/dependency-heavy tools merely for parity count
- [x] Close the self-contained V1.4 scope for v0.1.7 release packaging

V1.4 is complete. Detailed architecture, boundaries, regression evidence and deferred dependency/product decisions are in `docs/V1.4-PARITY-AUDIT.md` and `docs/V1.4-CLOSEOUT.md`.

"""
if "## V1.4 — Security, scan simulation and vector export" not in roadmap:
    roadmap = roadmap.replace(roadmap_anchor, release_sections + roadmap_anchor, 1)
roadmap_path.write_text(roadmap)

home_path = Path("frontend/app/page.tsx")
home = home_path.read_text()
old_banner = '<section className="coming-soon"><h2>V1.3 đã phát hành · bắt đầu V1.4</h2><p>V1.4 tiếp tục parity OSS theo hướng security-first và self-contained, ưu tiên reuse engine/browser pipeline hiện có trước khi nhận dependency mới.</p></section>'
new_banner = '<section className="coming-soon"><h2>V1.4 hoàn tất · SolYan PDF v0.1.7</h2><p>V1.4 khóa phạm vi self-contained với Auto Redact Text, Scanner Effect và PDF → PostScript / EPS; các dependency/provider lớn được giữ ngoài core cho tới khi có quyết định sản phẩm rõ ràng.</p></section>'
assert old_banner in home
home_path.write_text(home.replace(old_banner, new_banner, 1))

notes = """# SolYan PDF v0.1.7

**V1.4 OSS-first self-contained security, scan simulation and vector export**

This patch release closes the intentionally compact V1.4 pass after v0.1.6. The release adds three high-value capabilities while preserving the project rule that parity count alone does not justify a new runtime, provider or dependency family.

## New V1.4 tools

- **Auto Redact Text** — searches the existing PDF text layer for literal terms and securely replaces only affected pages with trusted rasters. Regression coverage requires redacted secrets to be absent from both extracted text and expanded reachable PDF content.
- **Scanner Effect** — deterministic browser-local scan simulation with High/Medium/Low DPI presets, grayscale/color modes, brightness/contrast, seeded noise, blur, optional yellowed paper, border and controlled skew.
- **PDF → PostScript / EPS** — Poppler `pdftops` export using the backend runtime already shipped by SolYan PDF: multi-page PS, single-page EPS, PostScript Level 2/3, page ranges and encrypted-PDF password support.

## Verification

Each accepted V1.4 capability has a dedicated exact-head regression gate. Before merge of the final PDF → PostScript / EPS feature, every pull-request-triggered workflow on that exact head completed successfully, including Backend CI, Frontend CI, Auto Redact Text CI, Scanner Effect CI, Color Transform CI and the remaining triggered regression suite.

Auto Redact's security gate verifies qpdf validity, retained extractable text on an untouched page, and absence of the secret from both `pdftotext` and expanded QDF reachable content. Scanner Effect gates deterministic pixel/preset semantics and explicit raster/provenance boundaries. PDF → PostScript CI converts a real two-page fixture to PS/EPS and validates page/range/level/error semantics.

The existing PDF-to-Office V1 release policy remains unchanged at **27 cases / 68 source pages** with its fixed target-specific fidelity, editability, page/geometry and scanned-XLSX thresholds.

## Architecture

V1.4 reuses PDF.js, Canvas, pdf-lib and Poppler already present in the SolYan stack. No new application runtime or provider dependency is added by the accepted scope.

Detailed decisions are recorded in `docs/V1.4-PARITY-AUDIT.md`; the final scope and release-readiness decision are recorded in `docs/V1.4-CLOSEOUT.md`.

## Important boundaries

- Auto Redact requires an existing text layer. Image-only scans must be OCRed first; affected pages are rasterized and lose original interactive/vector structures.
- Scanner Effect is a visual simulation, not OCR and not evidence of physical-scanner provenance. Its output is intentionally rasterized.
- PostScript is an executable page-description language for an interpreter. SolYan only generates PS/EPS; users should interpret them with trusted/sandboxed software.
- PDF → EPUB/AZW3 remains a Calibre/runtime expansion decision. PCL/XPS remain a Ghostscript/GhostPDL expansion decision. CBR/RAR and inline `BI … ID … EI` image removal remain tooling/parser expansion decisions.

## Remaining external decisions

Multi-party remote signing, cloud-storage connectors, AI summarization and PDF translation remain intentionally outside this self-contained release because they require separate product/provider/credential decisions.
"""
Path("docs/RELEASE-NOTES-v0.1.7.md").write_text(notes)

print("v0.1.7 metadata synchronized")
