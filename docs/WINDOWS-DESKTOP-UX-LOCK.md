# SolYan PDF Windows Desktop — UX/UI Source of Truth

Status: **LOCKED FOR WINDOWS DESKTOP V1**

This document is the product/visual continuity lock for the Windows desktop lane. Future sessions must read this file before changing desktop UI, navigation, naming, layout or packaging direction.

## Product identity

SolYan PDF Desktop is a **Windows application first**. It must look and behave like a polished Windows 10/11 desktop app. It must not imitate macOS chrome, traffic-light buttons, macOS shortcuts or macOS navigation conventions.

Visual formula:

- Windows 11 Fluent / WinUI language: primary foundation.
- iLovePDF: ease-of-use and tool discoverability reference.
- Apple-level polish: spacing, calmness and finish only; never macOS imitation.

Default typography: `Segoe UI Variable`, then `Segoe UI`, then system sans-serif.

## Non-negotiable usability rule

**Users must never have to solve a puzzle to find a tool.**

The app owns many tools, so the design must expose them without overwhelming the user:

1. Home shows 8–12 high-frequency tools immediately.
2. The rest are visible under clear user-language categories.
3. `Tất cả công cụ` exposes the complete catalog, not a curated subset.
4. Search is always prominent and `Ctrl + K` focuses it.
5. Sidebar categories filter tools but are not the only way to reach them.
6. Favorites and recent usage are shortcuts, not hidden navigation layers.
7. Common tasks must be reachable within one or two clicks from Home.
8. Advanced technical settings use progressive disclosure; ordinary users should not need to understand engine names.

## Locked category model

The Windows UI groups user-facing tools into:

1. Phổ biến
2. Sắp xếp PDF
3. Chỉnh sửa
4. Chuyển đổi
5. OCR & Scan
6. Bảo mật
7. Tối ưu
8. Phân tích
9. Cloud
10. Tiện ích Việt Nam

The canonical desktop catalog is `desktop/ui/catalog.js`. The catalog should reflect actual product capabilities; a tool must not be presented as working until its existing engine/route is wired and tested for the desktop runtime.

## Home visual direction

The approved concept is the generated Windows mockup discussed on 2026-10-17:

- light Windows Fluent surface;
- subtle Mica/Acrylic impression, never excessive glass;
- standard Windows window controls;
- pale neutral surfaces plus one primary blue accent;
- restrained colorful tool icons;
- generous spacing and soft corner radius;
- no Material Design dashboard look;
- no giant marketing carousel;
- no web-site-style header/footer navigation;
- clear `Công cụ phổ biến` section followed by grouped utilities and recent files.

The current implementation under `desktop/ui/` is the code representation of that concept and should converge toward the approved mockup rather than drift back to the old PWA styling.

## Tool-screen workflow

Every ordinary tool follows a simple linear pattern inspired by iLovePDF:

`Chọn/Kéo tệp -> Tùy chọn cần thiết -> Xử lý -> Xem/Lưu kết quả`

Rules:

- one obvious primary action;
- drag-and-drop plus file picker;
- plain Vietnamese labels;
- defaults should be safe and recommended;
- uncommon/technical controls go under `Tùy chọn nâng cao`;
- do not require separate Apply/Process/Export clicks when one action is enough;
- errors must say what the user can do next.

Example locked screen direction: `Nối PDF` uses a large drop zone, visible reorderable PDF cards, a simple right-side options panel and one primary `Nối PDF` button.

## Document workspace direction

When a PDF is opened, the interface changes from tool discovery to document-first work:

- left: page thumbnails;
- center: PDF page canvas;
- top contextual actions: Sửa, Chú thích, Chuyển đổi, OCR, Ký, Xuất;
- right: properties and contextual quick actions;
- zoom controls remain easy to reach;
- advanced inspector sections stay collapsed unless needed.

## Language rule

Primary UI language for the first Windows build: Vietnamese.

Names must describe the user outcome, not the engine implementation. Examples:

- `Structural Decompress` -> `Giải nén cấu trúc PDF`
- `Active Content Inspector` -> `Kiểm tra nội dung chủ động`
- `Raster Color Transform` -> `Đổi màu PDF`

Engine names such as qpdf, Tesseract, PaddleOCR, PP-StructureV3 or pyHanko belong in diagnostics/about/advanced details, not normal navigation labels.

## Continuity / anti-drop rule

The Windows desktop lane is **active** on `feat/windows-desktop-v1` until it is either merged/released or the user explicitly changes direction.

When the user says `ok`, `tiếp`, `tiếp tục`, or asks to keep working:

- resume this branch from current HEAD;
- read `AGENTS.md`, `docs/WINDOWS-DESKTOP-V1.md`, and this file;
- continue the next unfinished desktop milestone without asking routine confirmation;
- do not restart the architecture/UI selection discussion;
- do not silently abandon the lane for unrelated roadmap work;
- only stop for a real product choice, credentials/permissions, irreversible/destructive decision, or a hard tool boundary.

## Current implementation sequence

1. D1A — approved Windows Fluent home/tool-catalog shell.
2. D1B — Tauri configuration + real Windows CI/NSIS artifact.
3. D1C — file open/drop integration and document workspace shell.
4. D2 — local FastAPI core sidecar + qpdf/Poppler packaging.
5. D3 — LibreOffice Windows runtime.
6. D4 — OCR Windows sidecar/models.
7. D5 — signing/PDF-A and remaining engine surfaces.
8. D6 — installer smoke, cleanup, release readiness.

Do not call a milestone complete until its exact branch state and relevant CI have been verified.
