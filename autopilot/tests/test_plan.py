"""Network-free tests for deterministic task and CI transitions."""
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from plan import (classify_ci, new_state, next_task, pending_task,
                  permitted_files, reset_daily_usage, live_lease)


class PlannerTest(unittest.TestCase):
    def setUp(self):
        self.queue = {"tasks": [
            {"id": "a", "dependencies": []},
            {"id": "b", "dependencies": ["a"]},
        ]}

    def test_pass_automatically_unlocks_next(self):
        state = new_state()
        self.assertEqual(next_task(self.queue, state)["id"], "a")
        state["tasks"]["a"] = {"status": "waiting_ci"}
        self.assertIsNone(next_task(self.queue, state))
        self.assertEqual(pending_task(self.queue, state)["id"], "a")
        state["tasks"]["a"]["status"] = "done"
        self.assertEqual(next_task(self.queue, state)["id"], "b")

    def test_unrelated_success_cannot_pass(self):
        runs = [
            {"name": "Windows Desktop CI", "head_sha": "old", "head_branch": "feat/test", "status": "completed", "conclusion": "success"},
            {"name": "Windows Desktop CI", "head_sha": "new", "head_branch": "other", "status": "completed", "conclusion": "success"},
        ]
        self.assertEqual(classify_ci(runs, "new", "feat/test", ["Windows Desktop CI"])[0], "missing")

    def test_wait_then_pass_then_fail(self):
        def item(name, result, status="completed"):
            return {"name": name, "head_sha": "sha", "head_branch": "feat/test",
                    "status": status, "conclusion": result, "id": 101}
        required = ["A", "B"]
        self.assertEqual(classify_ci([item("A", "success")], "sha", "feat/test", required)[0], "missing")
        self.assertEqual(classify_ci([item("A", "success"), item("B", None, "in_progress")], "sha", "feat/test", required)[0], "running")
        self.assertEqual(classify_ci([item("A", "success"), item("B", "success")], "sha", "feat/test", required)[0], "pass")
        self.assertEqual(classify_ci([item("A", "success"), item("B", "failure")], "sha", "feat/test", required)[0], "fail")

    def test_permissions_budget_and_lease(self):
        self.assertTrue(permitted_files(["desktop/ui/app.ts"], ["desktop/"]))
        for path in ("AGENTS.md", "autopilot/queue.json", ".env", ".github/workflows/ci-result.yml"):
            self.assertFalse(permitted_files([path], ["desktop/", "autopilot/", ".github/", ""]))
        state = new_state()
        reset_daily_usage(state, "2026-10-18")
        state["usage"]["calls"] = 4
        reset_daily_usage(state, "2026-10-18")
        self.assertEqual(state["usage"]["calls"], 4)
        reset_daily_usage(state, "2026-10-19")
        self.assertEqual(state["usage"]["calls"], 0)
        state["lease"] = {"owner": "A", "expires_at": 200}
        self.assertTrue(live_lease(state, 100))
        self.assertFalse(live_lease(state, 201))


class GitClaimTest(unittest.TestCase):
    """A push to the same ref with the same parent has only one winner."""
    @staticmethod
    def git(*args, cwd=None, check=True):
        return subprocess.run(["git", *args], cwd=cwd, text=True, capture_output=True, check=check)

    def test_two_pcs_cannot_both_win_non_ff_claim(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            bare, pc1, pc2 = root/"server.git", root/"office", root/"home"
            self.git("init", "--quiet", "--bare", str(bare))
            self.git("clone", "--quiet", str(bare), str(pc1))
            self.git("config", "user.name", "Test", cwd=pc1)
            self.git("config", "user.email", "test@example.invalid", cwd=pc1)
            (pc1/"state.json").write_text('{"lease":null}\n')
            self.git("add", "state.json", cwd=pc1)
            self.git("commit", "--quiet", "-m", "init", cwd=pc1)
            self.git("push", "--quiet", "origin", "HEAD:refs/heads/autopilot-state", cwd=pc1)
            self.git("clone", "--quiet", "-b", "autopilot-state", str(bare), str(pc2))
            self.git("checkout", "--quiet", "-B", "autopilot-state", "origin/autopilot-state", cwd=pc1)
            for pc, name in ((pc1, "office"), (pc2, "home")):
                self.git("config", "user.name", "Test", cwd=pc)
                self.git("config", "user.email", "test@example.invalid", cwd=pc)
                (pc/"state.json").write_text(json.dumps({"lease": name}))
                self.git("add", "state.json", cwd=pc)
                self.git("commit", "--quiet", "-m", name, cwd=pc)
            first = self.git("push", "origin", "HEAD:refs/heads/autopilot-state", cwd=pc1, check=False)
            second = self.git("push", "origin", "HEAD:refs/heads/autopilot-state", cwd=pc2, check=False)
            self.assertEqual(first.returncode, 0)
            self.assertNotEqual(second.returncode, 0)


if __name__ == "__main__":
    unittest.main()
