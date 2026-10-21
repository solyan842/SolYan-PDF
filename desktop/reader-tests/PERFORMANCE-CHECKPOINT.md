# Reader performance acceptance — 2026-10-21

Verified base: `35c642ef1468e3448ac6620da4a573763d371dc4`, Reader CI #37
(`39545636790`) SUCCESS, including actual installed Save As, tab/page/zoom
restoration, F11, NSIS install/uninstall and no-orphan checks. Issue #138 is
the scope source: compact lightweight Reader, no Toolbox or editor expansion.
Newer repository-wide sTool runs are independent of this Reader branch.

This batch adds measurements and load acceptance only; no Reader product code,
engine, approved artwork, Toolbox runtime or existing native guard changes.

- One existing PDF plus nine generated PDFs (eight 3-page and one 100-page)
  must open in the same installed Reader window, retain real legible text,
  switch between three distinct tabs, jump to page 100, find its unique text
  and close the nine temporary tabs. The 100-page view must remain buffered
  rather than rendering every page. Generated original SHA-256 values remain
  unchanged after reading; the existing native source-integrity gate remains.
- A shared scenario is tested in Playwright before being used on the installed
  Windows EXE. Windows memory samples use the helper's existing exact-executable
  root PID and descendant census, recording per-process WorkingSet64 and
  PrivateMemorySize64, including WebView2, before/at ten tabs/after closure.
  They are point samples, not peak RAM or leak guarantees; shared working sets
  must not be interpreted as unique physical memory.
- Startup observations exclude policy preparation but include CDP attachment,
  polling and any early secondary launch. Profiles are fresh; OS caches are
  uncontrolled. These are observed upper bounds, not true disk-cold/warm
  benchmarks or Rune comparisons. CPU/OS/RAM/WebView2 and exact run/commit are
  recorded. Storage type is explicitly unmeasured.
- Durable output: `reader-native-results/installed-performance.json`, plus
  `startupMeasurement` entries in the existing `report.json`, preserved by the
  existing always-uploaded diagnostics artifact. No new workflow or paid API.

Local gates: focused ten-tab load test PASS; 16 Node tests and Reader
package/CSP/no-engine contract PASS; native JS and PowerShell syntax PASS.
Full browser suite: 41/41 PASS before pushing the single Reader-only CI.
Actual installed Windows memory values remain pending that exact-head CI.

Next: inspect exact-head CI and its measurements before making optimization
claims or product patches. Representative scanned/complex real PDFs, true
cache-controlled cold/warm runs on Windows 10/11, storage identification, Rune
comparison on the same machine, peak RAM and owner visual/physical-print QA
remain pending. Do not market this synthetic CI load as release readiness.
Main/stable and existing owner installation remain untouched. Local Cargo.lock,
generated Tauri files and icon.ico are preserved. Checkpoint and rest during CI.
