"""Fake-GitHub FSM tests: prove PASS selects next queued coding task."""
import copy
from pathlib import Path
import sys
import time
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import worker


class FakeStore:
    def __init__(self, state):
        self.state = copy.deepcopy(state)

    def read(self):
        return copy.deepcopy(self.state)

    def transact(self, mutation, retries=3):
        state = self.read()
        result = mutation(state)
        if result is not None:
            self.state = state
        return result


class WorkerTransitions(unittest.TestCase):
    def setUp(self):
        self.queue = {
            "max_fixes_per_task": 2,
            "tasks": [
                {"id": "d4", "dependencies": [], "required_workflows": ["Windows Desktop CI"]},
                {"id": "d5", "dependencies": ["d4"], "required_workflows": ["Windows Desktop CI"]},
            ],
        }
        self.store = FakeStore({
            "schema": 1, "lease": None, "usage": {"day": "", "calls": 0},
            "tasks": {"d4": {"status": "waiting_ci", "sha": "sha", "since": time.time()}},
        })
        self.calls = []
        self.patches = [
            patch.object(worker, "QUEUE", self.queue),
            patch.object(worker, "BRANCH", "feat/test"),
            patch.object(worker, "source_head", lambda: "sha"),
            patch.object(worker, "execute", lambda store, task, old, sha: self.calls.append(task["id"])),
            patch.object(worker, "log", lambda *args, **kwargs: None),
        ]
        for item in self.patches:
            item.start()
        self.addCleanup(lambda: [p.stop() for p in reversed(self.patches)])

    def set_run(self, status, conclusion):
        run = {"name": "Windows Desktop CI", "head_sha": "sha",
               "head_branch": "feat/test", "status": status,
               "conclusion": conclusion, "id": 1234}
        patcher = patch.object(worker, "exact_runs", lambda: [run])
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_pass_unblocks_and_invokes_next_without_manual_prompt(self):
        self.set_run("completed", "success")
        worker.tick(self.store)
        self.assertEqual(self.store.read()["tasks"]["d4"]["status"], "done")
        self.assertEqual(self.calls, ["d5"])

    def test_running_build_never_invokes_ai(self):
        self.set_run("in_progress", None)
        worker.tick(self.store)
        self.assertEqual(self.calls, [])
        self.assertEqual(self.store.read()["tasks"]["d4"]["status"], "waiting_ci")

    def test_failed_build_requests_repair_same_task(self):
        self.set_run("completed", "failure")
        worker.tick(self.store)
        self.assertEqual(self.calls, ["d4"])
        self.assertEqual(self.store.read()["tasks"]["d4"]["status"], "repair_ready")

    def test_cancelled_build_blocks_not_repaired(self):
        self.set_run("completed", "cancelled")
        worker.tick(self.store)
        self.assertEqual(self.calls, [])
        self.assertEqual(self.store.read()["tasks"]["d4"]["status"], "blocked")


if __name__ == "__main__":
    unittest.main()
