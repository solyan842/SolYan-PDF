"""Regression: never leave PyInstaller --onefile server children behind on Windows."""
from __future__ import annotations

import subprocess
import unittest
from unittest.mock import Mock, patch

import frozen_smoke_process as sut


class FrozenSmokeCleanupTests(unittest.TestCase):
    def test_windows_kills_only_owned_process_tree(self):
        proc = Mock()
        proc.pid = 424242
        proc.poll.return_value = None
        subprocess_result = Mock(returncode=0)
        with patch.object(sut.sys, "platform", "win32"), \
             patch.object(sut.subprocess, "run", return_value=subprocess_result) as run, \
             patch.object(sut.socket, "create_connection", side_effect=ConnectionRefusedError):
            sut.stop_frozen_sidecar(proc, 32001)
        run.assert_called_once_with(
            ["taskkill", "/PID", "424242", "/T", "/F"],
            capture_output=True, text=True, timeout=25, check=False,
        )
        proc.terminate.assert_not_called()
        proc.wait.assert_called_once_with(timeout=10)

    def test_linux_has_no_taskkill_and_terminates_own_process(self):
        proc = Mock()
        proc.poll.return_value = None
        with patch.object(sut.sys, "platform", "linux"), \
             patch.object(sut.subprocess, "run") as run, \
             patch.object(sut.socket, "create_connection", side_effect=ConnectionRefusedError):
            sut.stop_frozen_sidecar(proc, 32002)
        run.assert_not_called()
        proc.terminate.assert_called_once()
        proc.wait.assert_called_once_with(timeout=10)

    def test_failing_taskkill_cannot_silently_pass(self):
        proc = Mock()
        proc.pid = 7
        proc.poll.return_value = None
        subprocess_result = Mock(returncode=1, stdout="", stderr="Access denied")
        with patch.object(sut.sys, "platform", "win32"), \
             patch.object(sut.subprocess, "run", return_value=subprocess_result):
            with self.assertRaisesRegex(RuntimeError, "Access denied"):
                sut.stop_frozen_sidecar(proc, 32003)


if __name__ == "__main__":
    unittest.main()
