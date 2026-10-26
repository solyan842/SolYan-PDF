import socket
import unittest
from unittest.mock import patch

from backend.app.network_command import local_ip_addresses, ping_command


class NetworkUtilityTests(unittest.TestCase):
    def test_windows_uses_native_ping_switches_and_millisecond_timeout(self):
        self.assertEqual(ping_command("example.com", windows=True), ["ping", "-n", "4", "-w", "2000", "example.com"])

    def test_posix_keeps_posix_ping_switches(self):
        self.assertEqual(ping_command("example.com", windows=False), ["ping", "-c", "4", "-W", "2", "example.com"])

    @patch("backend.app.network_command.socket.getaddrinfo")
    def test_local_ip_filters_loopback_and_deduplicates(self, getaddrinfo):
        getaddrinfo.return_value = [
            (socket.AF_INET, socket.SOCK_STREAM, 0, "", ("127.0.0.1", 0)),
            (socket.AF_INET, socket.SOCK_STREAM, 0, "", ("192.168.1.20", 0)),
            (socket.AF_INET, socket.SOCK_STREAM, 0, "", ("192.168.1.20", 0)),
            (socket.AF_INET6, socket.SOCK_STREAM, 0, "", ("::1", 0, 0, 0)),
            (socket.AF_INET6, socket.SOCK_STREAM, 0, "", ("fe80::12%3", 0, 0, 3)),
        ]
        self.assertEqual(local_ip_addresses("QA-PC"), ["192.168.1.20", "fe80::12"])


if __name__ == "__main__":
    unittest.main()

