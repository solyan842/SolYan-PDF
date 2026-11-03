import hashlib
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "stool-package-manifest.py"
SOURCE_SHA = "0123456789abcdef0123456789abcdef01234567"
SPEC = importlib.util.spec_from_file_location("stool_package_manifest", SCRIPT)
assert SPEC is not None and SPEC.loader is not None
MANIFEST_MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MANIFEST_MODULE)


class StoolPackageManifestTests(unittest.TestCase):
    def test_writes_checksum_and_candidate_identity_without_changing_installer(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            installer = root / "SolYan PDF_0.1.0_x64-setup.exe"
            original = b"local NSIS package fixture\x00\xff"
            installer.write_bytes(original)
            output = root / "artifacts"
            manifest = MANIFEST_MODULE.create_package_manifest(installer, output, SOURCE_SHA)

            saved_manifest = json.loads((output / "stool-package.json").read_text(encoding="utf-8"))
            expected_hash = hashlib.sha256(original).hexdigest()
            self.assertEqual(
                saved_manifest,
                {
                    "repo": "solyan842/SolYan-PDF",
                    "source_commit": SOURCE_SHA,
                    "installer_name": installer.name,
                    "installer_bytes": len(original),
                    "installer_sha256": expected_hash,
                },
            )
            self.assertEqual(manifest, saved_manifest)
            self.assertEqual(
                (output / "sTool-PDF-Windows-x64.sha256").read_text(encoding="ascii"),
                f"{expected_hash} *{installer.name}\n",
            )
            self.assertEqual(installer.read_bytes(), original)

    def test_refuses_missing_or_invalid_source_identity(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            installer = root / "candidate.exe"
            installer.write_bytes(b"fixture")
            with self.assertRaisesRegex(ValueError, "full 40-character"):
                MANIFEST_MODULE.create_package_manifest(installer, root / "artifacts", "not-a-full-sha")
            self.assertFalse((root / "artifacts" / "stool-package.json").exists())

    def test_refuses_missing_installer(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            with self.assertRaises(FileNotFoundError):
                MANIFEST_MODULE.create_package_manifest(root / "missing.exe", root / "artifacts", SOURCE_SHA)
            self.assertFalse((root / "artifacts" / "stool-package.json").exists())


if __name__ == "__main__":
    unittest.main()
