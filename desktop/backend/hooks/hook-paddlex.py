"""Keep PaddleX OCR dependency checks working in the frozen Windows sidecar.

PaddleX checks distribution versions, not just importability. collect-all keeps
modules/data but not all optional OCR dependencies' dist-info directories.
"""
from importlib.metadata import requires

from packaging.requirements import Requirement
from PyInstaller.utils.hooks import copy_metadata

datas = copy_metadata("paddlex", recursive=True)
for spec in requires("paddlex") or ():
    requirement = Requirement(spec)
    if requirement.marker and any(
        requirement.marker.evaluate({"extra": extra}) for extra in ("ocr", "ocr-core")
    ):
        # Fail the build if a declared OCR dependency was not installed. Do not
        # bypass upstream dependency validation or manufacture version metadata.
        datas += copy_metadata(requirement.name, recursive=True)
