# SolYan-PDF — MANDATORY AGENT ENTRY GATE

Status: **REQUIRED / REPO SOURCE OF TRUTH**

This file exists to prevent stale-state work, repeated fixes, CI diagnosis without real logs, accidental `main` edits, benchmark weakening, false success reports, and unnecessary custom implementation when mature open-source building blocks already exist.

Repository state always wins over conversation memory, handoff notes, screenshots, or previous assistant claims.

## 0. STOP GATE — READ BEFORE ANY WORK

Before diagnosis, code edits, workflow changes, benchmark changes, releases, or continuation from a previous conversation:

1. verify the repository is `solyan842/SolYan-PDF`;
2. inspect the current repository state from GitHub;
3. read this `AGENTS.md` from the branch/ref being worked on;
4. read `README.md` and relevant files under `docs/`, `benchmarks/`, and `.github/workflows/` for the current task;
5. verify the current branch HEAD before relying on any remembered commit/run/branch;
6. verify whether the proposed fix/work already exists before repeating it.

If repository evidence conflicts with memory or a handoff, follow the repository.

## 1. LATEST WORKFLOW RUN IS THE CI SOURCE OF TRUTH

Before **every** CI diagnosis, CI status report, or continuation after a previous run:

1. fetch the latest workflow runs for the **entire repository with no branch filter**;
2. identify the newest/current run by repository state, not by memory;
3. read its `run_number`, `id`, `head_branch`, `head_sha`, `status`, `conclusion`, and workflow name directly;
4. treat that run's `head_branch` and `head_sha` as the active CI state for the next diagnostic step;
5. only then fetch jobs, logs, checks, and artifacts for that exact run.

**Forbidden:**
- starting diagnosis from a remembered branch or old run number;
- using a branch-filtered run list to decide what the repository's latest run is;
- continuing to diagnose an older run after a newer run exists, unless historical behavior was explicitly requested;
- reporting an older run as current without refreshing repository-wide workflow runs;
- changing code for a failed run before confirming that the run `head_sha` still matches the relevant branch HEAD.

If the user/UI reports a newer run than the agent sees, refresh the repository-wide run list immediately.

## 2. FAILED GITHUB ACTIONS — REAL LOGS BEFORE CODE CHANGES

For every failed GitHub Action:

1. refresh repository-wide workflow runs and identify the exact current `run_id`;
2. identify the exact failed `job_id`;
3. fetch the raw job log **once**;
4. if usable real log text is returned, find the first meaningful/root error;
5. if raw log is empty, inaccessible, suppressed, truncated, `Skipped`, or otherwise unusable, **do not retry the same raw-log path**;
6. immediately fetch the run/job's durable diagnostic artifact if one exists;
7. inspect the actual artifact log;
8. only after real error text is visible may source/workflow logic be changed.

Never infer root cause from run status, job status, step names, check summaries, screenshots, conversation history, or memory.

If neither raw log nor durable artifact can be consumed because of connector/tool limitations, report the exact blocked boundary and **STOP**. Do not loop on the same endpoint and do not invent a diagnosis.

### Durable logging requirement

Every workflow that builds, tests, compiles, converts, benchmarks, or runs diagnostics should preserve useful combined stdout/stderr in a deterministic artifact using `if: always()` while preserving the native command's real exit code.

If a failing workflow has no durable diagnostic artifact, add observability as a narrowly scoped change. Do not mix a logging change with speculative product fixes.

## 3. NO REPEATED WORK / NO STATE DRIFT

Before proposing or applying a fix:

- verify whether the fix already exists on the current branch;
- verify the exact file contents at current HEAD;
- verify whether a newer run/commit supersedes the one being discussed;
- inspect existing regression tests before adding duplicates.

**Forbidden:**
- retrying the same failed log-retrieval path after its fallback condition is reached;
- re-applying an already-present patch;
- creating a second implementation of an existing feature without evidence the first is wrong;
- claiming a checkpoint, fix, release, or merge exists without re-fetching it;
- continuing from stale branch state after HEAD advances.

## 4. BRANCH / WRITE GATE

Before every write:

1. verify the target branch from current GitHub state;
2. preserve `main` unless the user explicitly requests a direct `main` change;
3. create/use a dedicated branch for experimental, benchmark, OCR, Bloom, conversion, or workflow work;
4. keep temporary probes/debug workflows isolated and remove them before merge unless they are intentionally permanent;
5. do not widen scope beyond the current task without repository evidence.

After every write/change:

1. re-fetch the changed file from the target branch;
2. verify the intended content is present;
3. verify the branch HEAD/commit actually advanced as expected;
4. only then report the change as completed.

Never report `done`, `fixed`, `saved`, `merged`, `released`, or `locked` based only on an attempted write call.

## 5. SOLYAN-PDF ARCHITECTURE / SCOPE LOCKS

SolYan-PDF is **web-first**. The default deliverable is the web/PWA stack; desktop/native packaging is secondary unless explicitly requested.

Core product areas include:

- PDF merge/split/extract/reorder/remove/rotate;
- watermark/page numbers/metadata;
- protect/unlock/repair/compression;
- viewer/basic editor/forms/signing/PDF-A paths;
- OCR with Vietnamese support;
- Office/OpenDocument/RTF/images to PDF;
- PDF to image;
- V1-gated multi-engine PDF to DOCX/XLSX/PPTX routing: LibreOffice PDF import first for DOCX/PPTX with pinned Bloom as best-effort fallback, and Bloom primary for XLSX with PP-StructureV3 fallback for scanned/no-logical-table cases;
- Vietnamese utility tools.

Do not silently expand scope into cloud connectors, remote signing, AI summarization, translation, or other major product families unless explicitly requested.

## 6. BLOOM / PDF→OFFICE RULES

The PDF→Office surface is release-gated and evidence-driven. The pinned Bloom component remains an optional/external engine inside that multi-engine routing architecture; it is not the universal source of truth for every target or document class.

Rules:

- pin upstream Bloom source to an exact commit/ref;
- prefer minimal patches over broad rewrites;
- add a regression test for every reproducible bug before or with the fix;
- separate upstream defects from SolYan patches;
- keep synthetic benchmark and real-world corpus results distinct;
- do not make universal PDF→DOCX/XLSX/PPTX fidelity claims merely because the current V1 corpus passes;
- do not weaken a quality/page-count/geometry/editability gate just to make a run green.

A gate may only be adjusted when evidence proves the old gate measures noise rather than correctness; document the exact before/after measurement and preserve the underlying invariant.

For Office roundtrip failures, distinguish at least:

1. Bloom export failure;
2. invalid OOXML package/XML/relationships;
3. LibreOffice import/conversion failure;
4. benchmark transport/metadata error;
5. external corpus/download failure;
6. true visual/layout fidelity regression.

Do not patch the wrong layer.

The permanent `pdf-to-office-release-v1` policy is the release source of truth for accepted V1 corpus thresholds. It currently combines 18 controlled synthetic cases with 9 pinned public real-world cases (27 cases / 68 source pages total) and must not be weakened without measured evidence.

## 7. OCR / REAL-WORLD CORPUS RULES

For Vietnamese OCR and other real-world corpora:

- use real scanned/public documents where the benchmark claims real-world coverage;
- require clear provenance and license/usage basis;
- pin exact revisions/commits/URLs where possible;
- record/verify SHA-256 or equivalent immutable fingerprints for downloaded inputs;
- do not substitute synthetic pages merely to reach a target corpus count;
- keep machine-generated OCR separate from human-corrected ground truth;
- document corpus composition and baseline metrics before setting regression budgets.

External-source rate limits (GitHub, Wikimedia, etc.) are infrastructure failures, not product failures. Isolate them with reproducible fetch jobs/artifacts instead of changing product logic.

## 8. BENCHMARK INTEGRITY GATE

Never make a failing benchmark pass by hiding/removing hard cases, skipping failures, reducing corpus coverage, suppressing non-zero exits, or lowering thresholds without evidence.

For every benchmark change, preserve:

- native process exit code;
- raw result artifacts/logs;
- per-case results where practical;
- source/roundtrip page counts when relevant;
- geometry/fidelity metrics when relevant;
- exact corpus/input identity.

When a diagnostic benchmark is exploratory, label it **diagnostic** and do not silently convert it into a release gate.

## 9. RELEASE GATE

Do not publish a new release merely because one feature branch is green.

Before release:

1. verify the intended changes are merged into current `main`;
2. refresh and inspect current `main` CI;
3. require all relevant release gates to PASS;
4. verify version files/lockfiles are synchronized;
5. verify no temporary probe/debug workflow is unintentionally included;
6. create/check tag and release against the exact intended `main` commit;
7. re-fetch the release and verify it is neither draft nor prerelease unless explicitly intended.

Subsystem status must follow representative real-world evidence and the permanent release policies in the repository, not stale labels from older release notes.

## 10. EXECUTION CONVENTION FOR THIS PROJECT

When the user says **`ok`**, **`tiếp`**, or **`tiếp tục`**, continue the current agreed implementation automatically without asking for confirmation again.

Work continuously through the current plan. Ask the user only when:

- a product decision cannot be inferred from repository evidence;
- credentials/permissions/external access are required;
- a destructive or materially irreversible choice needs approval;
- the repository/tools create a hard boundary that cannot be resolved safely.

Do not stop merely to narrate a routine intermediate step.

## 11. SUCCESS REPORTING

A success report must be grounded in repository evidence.

Use precise language:

- `implemented` only after re-fetch confirms code exists;
- `CI PASS` only after checking the exact current workflow run;
- `merged` only after re-fetching PR/branch/main state;
- `released` only after re-fetching the release/tag;
- `fixed` only when the relevant regression or reproduction passes.

If only part of a task is complete, state exactly what passed and what remains.

## 12. OSS-FIRST / SPEED GATE — REUSE BEFORE REWRITE

For every non-trivial subsystem, hard conversion path, parser, renderer, OCR/layout problem, Office export issue, or repeated fidelity defect, **do not begin with custom implementation**.

Before writing substantial new code or applying another deep patch to one engine:

1. search GitHub/current upstream projects for mature open-source implementations that already solve the same layer;
2. compare at least the most relevant candidates on capability, license, maintenance activity, integration cost, platform fit, output fidelity, and failure behavior;
3. prefer **adapter / orchestration / routing / fallback** around proven engines over reimplementing the engine inside SolYan-PDF;
4. reuse existing project APIs/CLIs/libraries with thin adapters when that is faster and safer;
5. only custom-code the missing delta that cannot reasonably be obtained from an existing maintained project;
6. record any important engine choice or rejection in repository code/docs/tests so the same research is not repeated later.

For PDF/OCR/Office work, the default comparison set should include relevant maintained projects such as **Stirling-PDF, PaddleOCR, Docling, MinerU, Camelot**, plus any more specialized active project discovered for the exact conversion type. This list is a baseline, not a limit.

### Mandatory anti-rabbit-hole rule

If one engine requires repeated case-specific fixes, expanding patches, or multiple consecutive rounds of fidelity repair, stop adding patches long enough to re-evaluate whether:

- another OSS engine already handles that document class better;
- a classifier/router can send that class to a better engine;
- a high-fidelity visual fallback can satisfy the user-visible requirement;
- the problematic path should remain experimental instead of blocking the whole release.

Do not let one experimental engine become the critical path for the entire product when a reliable fallback exists.

### PDF→Office routing principle

PDF→Office should be treated as a **multi-engine routing problem**, not as a requirement for Bloom or any single converter to solve every document class.

Prefer this order:

1. classify the input document/page type;
2. route to the strongest available engine for that class;
3. validate output with real corpus/roundtrip metrics;
4. fall back to a safer engine or visual-preservation path when editable fidelity is insufficient;
5. keep any weaker or unvalidated path explicitly limited until evidence supports promotion.

For V1, do not delay the whole release solely to chase perfect editability on every PDF→Office case when a clearly labeled, high-fidelity fallback provides correct user-visible output.

### Speed discipline

Repository work should optimize for **verified user value per change**, not amount of custom code.

Forbidden:

- spending long cycles rebuilding capabilities already available in mature OSS;
- continuing a deep patch series without checking alternative engines;
- treating a single upstream tool as mandatory when orchestration would be simpler;
- researching the same upstream alternatives again because the decision was never written into the repo;
- expanding scope merely to make one engine universal.
