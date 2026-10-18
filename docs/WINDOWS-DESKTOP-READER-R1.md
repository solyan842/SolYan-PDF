# Reader R1 + Quick Sign offline

Base: Windows Desktop CI [#132](https://github.com/solyan842/SolYan-PDF/actions/runs/39136970450), exact commit `fa004ff78760bb21646dd94e01934b8164cb5945`. Work is isolated on `feat/windows-reader-r1`; existing Tools, engines and D6 gates remain intact. `AGENTS.md` remains the source of truth.

## Reuse / OSS decision

Reuse the project's pinned **PDF.js 6.4.299** (Apache-2.0) viewer components for rendering, bounded canvas buffering, selectable text, find, links and page navigation; use existing **pdf-lib 1.17.1** (MIT) to embed signature PNGs in content streams. This is orchestration around the existing maintained libraries, not a new PDF parser/renderer. Native browser PDF embedding does not expose consistent page transforms/search/overlays; a MuPDF-based replacement would add another engine/license/integration boundary. Neither offers a reason to replace the approved Tauri 2 stack for R1. Upstream interfaces: [PDF.js components](https://github.com/mozilla/pdf.js/tree/master/examples/components), [pdf-lib image drawing](https://pdf-lib.js.org/docs/api/classes/pdfpage#drawimage).

## Reader behavior

- Local open/file drop and Windows file-association launch; no document upload. Independent tab state; closing an unsaved working document asks before discarding.
- PDF.js continuously scrolls and renders visible pages with its normal page buffer. Thumbnails are observed/rendered lazily. Outline, full-text find/highlights, page navigation, fit-width/fit-page and zoom reuse PDF.js.
- Open first page without rendering the entire document. Per-file input cap: 200 MB; per-page canvas cap: 12 million pixels. These are R1 resource bounds, not a universal performance guarantee.
- PDF scripting/eval and external link navigation are disabled in Reader. Vendored worker/WASM/font/CMap assets stay local. CSP allows a local/blob worker and WebAssembly compilation for the bundled PDF.js decoders; arbitrary JavaScript `unsafe-eval` and inline scripts/styles remain disallowed.

## Quick Sign contract

- Draw with pointer/mouse/pen, decode PNG/JPEG, or render a typed Unicode name on a local canvas. Only the signature becomes an image; the PDF page does not.
- Move directly on page. Four corner handles preserve the current ratio; four side handles resize one axis. Arrow keys provide small adjustments. Geometry stays bounded to the displayed page.
- One page, an explicit range such as `1,3-5`, or all pages. A template retains display-oriented PDF-point position/size across pages; on smaller pages it shrinks uniformly to fit. Placement conversion inverts the PDF.js viewport transform, including crop origin and rotations 0/90/180/270.
- Windows uses a native **Save As** dialog, defaults to a new `*-da-ky.pdf` filename, and writes through a same-directory temporary file plus atomic replacement. Cancel keeps the dirty working copy; a successful write clears the marker. Browser preview uses a download and deliberately does not claim the native save was completed. Source bytes remain immutable.
- The saved file contains image XObjects in ordinary page content, not editable signature annotations or a full-page raster. Reopening shows the flattened signature while retaining searchable original text. Existing PDF content, page count, crop and rotation are retained by pdf-lib.
- This is a visual signature, not certificate/PKCS#12 signing. The original Tools certificate-signing/verification routes remain available. PDF.js may read password-protected input; pdf-lib's encryption restrictions still apply to Quick Sign export. No digital-signature validation claim is made for modified copies.
- Signature artwork stays in the open session, not a permanent signature vault. Private files/signatures are never sent to an AI API.

## Independent installation / transition

Tools opens Reader in a separate Tauri window and retains the complete Tools UI and engines. Reader can focus/reopen the Tools window. The independent Reader profile has its own product name, identifier, binary name and installer and skips every Tools sidecar at startup. Its Tools button launches the separately installed Tools app or reports that Tools is not installed.

```powershell
cd desktop/reader-tests
npm ci
node stage.mjs
npm test
npx playwright install chromium
npm run e2e
# From desktop/src-tauri, after staging assets:
npx --yes @tauri-apps/cli@2.12.3 build --config tauri.reader.conf.json --features reader-only --bundles nsis
```

Installer choices can affect Windows PDF associations; the two applications retain separate installation identities. No remote host, Docker, Python or engine runtime is required by standalone Reader.

## Validation / CI batching

One Windows Desktop CI push runs the existing full Tools gates and adds Reader tests, builds the Reader profile, installs it and verifies it runs without any Tools sidecar. Existing Tools artifacts/checksums are uploaded before building Reader. Reader gets its own `SolYan-PDF-Reader-Windows-x64` artifact and `windows-reader-diagnostics`; the existing automatic CI result/issue notifications remain active. No extra workflow or automatic rerun is introduced.

Local checks before the single commit/push:

- Core tests: eight handles, corner/edge invariants, bounds, range parsing, physical-size template copying, source immutability, flattened images, searchable text and save/reopen on all four rotations with nonzero crop origins.
- Chromium tests: outline, thumbnails, find, zoom, drag/resize, typed/mouse/image signatures, range/all-page application, multi-tab state, saved-file reopen, native Save As bridge success/cancel. A 100-page fixture stays navigable with fewer than 30 retained page canvases and makes no external HTTP request.
- Existing UI/CSP and all five Phosphor integrity/layout tests remain enforced; workflow syntax is checked with actionlint.

Local machine has no Cargo/Rust toolchain: native compilation, actual Win32 Save As API linkage, NSIS packaging and installed Reader startup require the linked Windows CI result. Browser bridge tests do not pretend to prove a native dialog was manually exercised. Completion must be reported against the actual commit and workflow result.
