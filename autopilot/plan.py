"""Pure SolYan Autopilot state transition helpers; no network or AI calls."""
from datetime import datetime, timezone


def new_state():
    return {"schema": 1, "lease": None, "tasks": {}, "usage": {"day": "", "calls": 0}}


def today_utc():
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def reset_daily_usage(state, day):
    if state["usage"]["day"] != day:
        state["usage"] = {"day": day, "calls": 0}


def live_lease(state, now):
    lease = state.get("lease")
    return bool(lease and lease.get("expires_at", 0) > now)


def next_task(queue, state):
    """An accepted task must be done before its dependent successor is selected."""
    statuses = state.get("tasks", {})
    for task in queue["tasks"]:
        record = statuses.get(task["id"], {})
        if record.get("status", "queued") not in ("queued", "working"):
            continue
        if all(statuses.get(dep, {}).get("status") == "done" for dep in task.get("dependencies", [])):
            return task
    return None


def pending_task(queue, state):
    for task in queue["tasks"]:
        record = state.get("tasks", {}).get(task["id"], {})
        if record.get("status") in ("waiting_ci", "repair_ready"):
            return task
    return None


def classify_ci(runs, sha, branch, required):
    """Use exact-SHA, exact-branch results; unrelated green workflows never count."""
    current = {}
    for run in runs:
        if run.get("head_sha") != sha or run.get("head_branch") != branch:
            continue
        name = run.get("name")
        if name in required and name not in current:
            current[name] = run
    if any(name not in current for name in required):
        return "missing", None
    if any(current[name].get("status") != "completed" for name in required):
        return "running", None
    bad = next((current[name] for name in required if current[name].get("conclusion") != "success"), None)
    return ("fail", bad) if bad else ("pass", None)


def source_branch_safe(branch):
    return branch.startswith("feat/") and branch not in ("main", "master")


def permitted_files(files, prefixes):
    forbidden = ("AGENTS.md", ".env", ".github/workflows", "autopilot/queue.json")
    return bool(files) and all(
        not (path == f or path.startswith(f + "/") for f in forbidden)
        and any(path == p or path.startswith(p) for p in prefixes)
        for path in files
    )
