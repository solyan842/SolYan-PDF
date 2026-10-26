import unittest

from backend.app.network import _ping_command


class PingCommandTests(unittest.TestCase):
    def test_windows_uses_native_ping_switches_and_millisecond_timeout(self):
        self.assertEqual(
            _ping_command("example.com", windows=True),
            ["ping", "-n", "4", "-w", "2000", "example.com"],
        )

    def test_posix_keeps_posix_ping_switches(self):
        self.assertEqual(
            _ping_command("example.com", windows=False),
            ["ping", "-c", "4", "-W", "2", "example.com"],
        )


if __name__ == "__main__":
    unittest.main()
