"""Clean up *all* frozen PyInstaller smoke-test children on Windows.

PyInstaller --onefile launches an extraction parent and a server child. Killing
only the Popen parent can leave the child holding installed exe files open,
making the real NSIS uninstall fail. Only the process tree launched by this
test is targeted; do not kill arbitrary SolYan processes system-wide.
"""
from __future__ import annotations

import socket
import subprocess
import sys
import time


def stop_frozen_sidecar(proc: subprocess.Popen, port: int) -> None:
    """Stop test-owned server descendants and prove its loopback port closes."""
    if proc.poll() is None:
        if sys.platform == "win32":
            result = subprocess.run(
                ["taskkill", "/PID", str(proc.pid), "/T", "/F"],
                capture_output=True, text=True, timeout=25, check=False,
            )
            if result.returncode != 0:
                raise RuntimeError(
                    f"Failed to terminate own frozen sidecar PID {proc.pid} tree: "
                    f"{result.stderr.strip() or result.stdout.strip()}"
                )
        else:
            proc.terminate()
        try:
            proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait(timeout=5)

    deadline = time.monotonic() + 15
    while True:
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=0.25):
                still_listening = True
        except OSError:
            still_listening = False
        if not still_listening:
            return
        if time.monotonic() >= deadline:
            raise RuntimeError(
                f"Frozen smoke sidecar still listening on 127.0.0.1:{port} after cleanup"
            )
        time.sleep(0.25)
