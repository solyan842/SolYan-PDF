import hashlib
import importlib.util
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location("package_manifest", Path(__file__).parents[1] / "stool-package-manifest.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class CandidateIdentity(unittest.TestCase):
    def test_records_exact_bytes_without_claiming_functional_acceptance(self):
        with tempfile.TemporaryDirectory() as root:
            installer = Path(root) / "candidate.exe"
            payload = b"MZ public candidate identity fixture"
            installer.write_bytes(payload)
            result = module.manifest(installer, "a" * 40)
            self.assertEqual(result["installer_sha256"], hashlib.sha256(payload).hexdigest())
            self.assertEqual(result["installer_bytes"], len(payload))
            self.assertEqual(result["source_commit"], "a" * 40)
            self.assertFalse(result["release_accepted"])
            self.assertEqual(result["functional_acceptance"], "not-run")

    def test_refuses_non_executable_or_unknown_source(self):
        with tempfile.TemporaryDirectory() as root:
            installer = Path(root) / "candidate.exe"
            installer.write_bytes(b"not a Windows installer")
            with self.assertRaises(ValueError):
                module.manifest(installer, "a" * 40)
            installer.write_bytes(b"MZ fixture")
            for commit in ["", "main", "a" * 39, "z" * 40]:
                with self.assertRaises(ValueError):
                    module.manifest(installer, commit)
