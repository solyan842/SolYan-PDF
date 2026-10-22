# Reader CI #39 repair — 2026-10-22

Verified feature HEAD: 2a52b7443f32e94b71f0c81db161b5856c0ad5ae on feat/windows-reader-fast-window-print-links. Latest repository-wide Actions at entry: Reader #39 failed; sTool Installer #4 and Fast #9 remain PASS. main/stable unchanged.

Raw failed job119241951606 was read ONCE in this continuation. Root error is Rust syntax in src/reader_window_state.rs:23: two let bindings separated by a comma. Corrected to two let statements. No behavior, UI, persistence policy, engine or test threshold changes. Do not reload the same raw log.

Existing CI #39 evidence: 19 Node tests PASS,43 browser tests PASS, Save As fast native dialog gate PASS. Native Rust compile failed before installer/native acceptance. Run: https://github.com/solyan842/SolYan-PDF/actions/runs/39605921055 . Diagnostics artifact12347839365 remains available.

Local repair checked in an isolated archive of exact HEAD at work/reader-39-fix; older work/reader-next and primary checkout preserved. Existing Rust1.99.1/MSVC/cache reused. cargo test --offline --features reader-only -- --nocapture:10/10 PASS, real compiler and linker exit0. Same TAURI_CONFIG as CI. No extra browser rerun because its product files did not change and exact-head predecessor already passed those gates.

Next: inspect the exact-head Reader-only CI triggered by this coherent push. Preserve all native window-state, URL confirmation, print preparation, Save As, session/load, no-sidecar and uninstall checks. No sTool build and no stable promotion. Physical printer/driver acceptance and documented print limits remain explicit.
