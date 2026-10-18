import runpy
import sys
import unittest
from importlib.metadata import PackageNotFoundError
from pathlib import Path
from types import ModuleType
from unittest.mock import patch


HOOK = Path(__file__).resolve().parents[1] / "hooks" / "hook-paddlex.py"


class PaddleXMetadataHookTest(unittest.TestCase):
    def run_hook(self, specs, copy):
        hooks = ModuleType("PyInstaller.utils.hooks")
        hooks.copy_metadata = copy
        with patch.dict(sys.modules, {"PyInstaller.utils.hooks": hooks}), patch(
            "importlib.metadata.requires", return_value=specs
        ):
            return runpy.run_path(str(HOOK))

    def test_ocr_metadata_survives_freezing_without_unrelated_extras(self):
        copied = []

        def copy(name, recursive=False):
            self.assertTrue(recursive)
            copied.append(name)
            return [(name, name + ".dist-info")]

        result = self.run_hook(
            [
                'imagesize; extra == "ocr-core"',
                'opencv-contrib-python==4.10.0.84; extra == "ocr"',
                'scipy; extra == "ocr"',
                'torch; extra == "genai"',
                'windows-only; sys_platform == "win32" and extra == "ocr"',
            ],
            copy,
        )
        self.assertEqual(copied[:4], ["paddlex", "imagesize", "opencv-contrib-python", "scipy"])
        self.assertNotIn("torch", copied)
        self.assertEqual("windows-only" in copied, sys.platform == "win32")
        self.assertEqual(len(result["datas"]), len(copied))

    def test_missing_ocr_distribution_fails_build(self):
        def copy(name, recursive=False):
            if name == "imagesize":
                raise PackageNotFoundError(name)
            return []

        with self.assertRaises(PackageNotFoundError):
            self.run_hook(['imagesize; extra == "ocr-core"'], copy)


if __name__ == "__main__":
    unittest.main()
