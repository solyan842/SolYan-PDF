# SolYan PDF Autopilot — opt-in multi-PC worker

This is a code-and-testable implementation, **not an activated cloud agent**.
It does not run until installed on a real signed-in Windows PC. GitHub Actions
continues building independently of any computer; a PC is required to run AI.

## Control plane

- Approved queue: autopilot/queue.json on controller branch feat/autopilot-engine.
- Mutable shared state: state.json on independent branch autopilot/state.
- PC worktrees: %LOCALAPPDATA%/SolYan-PDF-Autopilot/{app,work,control}.
- Scheduler: per-user Windows task, every 5 minutes. State and CI checks consume
  no AI turns. No Chat conversation is polled.
- Two machines: a claim is a normal non-force Git push of a commit based on the
  state branch's current tip. Competing commits from the same parent cannot both
  be fast-forward updates. A lease carries a unique host/session owner and
  expires after 10 minutes; active Codex runs renew it every 45 seconds. If
  renewal fails, Codex is terminated and no push is authorized.
- Only one AI action happens per claimed task. On successful push it enters
  waiting_ci, and the worker exits; GitHub Actions performs the expensive build.
- The next tick reads **repo-wide** Actions, then requires success on the
  relevant exact source SHA and branch; only then is the next queued task
  eligible. FAIL triggers bounded real-log evidence collection and a repair.
  Missing/cancelled/unknown evidence is never treated as success.

## User setup (once per PC, with the user logged on)

Install Git, GitHub CLI, PowerShell 7, Python 3.13 and the official Codex CLI.
Authenticate separately on both PCs: gh auth login; codex login. Credentials
remain local; never copy them into the repository or between computers.

Use PowerShell 7, from a downloaded or cloned controller branch:

    pwsh -File ./scripts/Install-Autopilot.ps1

The installer performs a read-only status check before registering a per-user
scheduled task. It does not sign into services for you. To inspect state:

    python "$env:LOCALAPPDATA\SolYan-PDF-Autopilot\app\autopilot\worker.py" status

Turn off the task via Task Scheduler, task SolYan-PDF-Autopilot. Source branch
is never main and release/merge/publishing are outside this queue.

## Limits and security

- **Chat conversations are not directly callable from an unattended script.**
  The current worker uses a configurable coding-agent boundary; this version
  invokes signed-in Codex CLI, which remains subject to ChatGPT plan limits.
  Swapping AI providers requires another supported local runner and user
  authorization; the GitHub orchestration itself is AI-independent.
- This is intentionally bounded: 4 agent invocations per UTC day shared by PCs,
  at most 2 repair calls per task; no paid API keys or hidden subscriptions.
- A PASS workflow proves the workflow ran at that SHA, not universal product
  correctness. The queue lists bounded engineering milestones, not a release.
- Do not install on an untrusted/shared PC or run from untrusted pull-request
  code. App state history contains task metadata and error summaries, never
  secrets or document contents.
- Neither a PC that is powered off nor ordinary Chat can autonomously author
  source changes. When both PCs are off, GitHub can build and report but not
  wake a PC. No claim of 24/7 cloud execution is made.
- On error, the worker fails closed. It never force-pushes, adjusts benchmark
  acceptance, bypasses branch protections or downgrades CI to obtain PASS.
- Unattended editing is limited to configured path prefixes. The controller
  must be installed and its behavior validated on Windows before describing
  the whole system as deployed.

## Verification

GitHub's Autopilot Controller Tests workflow runs Python syntax, deterministic
queue/CI tests and a local bare-Git two-worker push race, plus Windows
PowerShell syntax parsing. These tests do not prove real ChatGPT login,
Task Scheduler registration, OCR/installer acceptance, or a live AI repair.
The status preflight and a manual first execution on each Windows PC are
therefore mandatory installation checks.
