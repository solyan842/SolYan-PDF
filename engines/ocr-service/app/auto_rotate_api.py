from __future__ import annotations

import tempfile
from pathlib import Path
from typing import Any

from fastapi import File, Form, HTTPException, UploadFile

from .main import _read_upload, app
from .orientation import analyze_orientation_file, plan_corrections


@app.post("/ocr/orientation")
def ocr_orientation(
    file: UploadFile = File(...),
    confidence_threshold: float = Form(default=14.0),
    infer_undetected: bool = Form(default=False),
) -> dict[str, Any]:
    """Analyze page orientation without modifying source content.

    Tesseract OSD sees temporary PDFium rasters only. The returned plan contains
    clockwise *relative* corrections that the backend may later apply with qpdf.
    Low-confidence and unresolved pages remain unchanged by default.
    """

    if not 0.0 <= confidence_threshold <= 100.0:
        raise HTTPException(status_code=422, detail="confidence_threshold must be between 0 and 100")

    data, suffix = _read_upload(file)
    with tempfile.TemporaryDirectory(prefix="solyan-orientation-") as temp_dir:
        input_path = Path(temp_dir) / f"input{suffix}"
        input_path.write_bytes(data)
        try:
            detected = analyze_orientation_file(input_path, suffix)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        except Exception as exc:
            raise HTTPException(status_code=422, detail=f"Orientation analysis failed: {exc}") from exc

    plan = plan_corrections(
        detected,
        confidence_threshold=confidence_threshold,
        infer_undetected=infer_undetected,
    )
    return {
        "mode": "orientation",
        "engine": "Tesseract OSD + PDFium",
        "confidenceThreshold": confidence_threshold,
        "inferUndetected": infer_undetected,
        "pages": plan,
        "summary": {
            "pages": len(plan),
            "rotate": sum(1 for item in plan if item.get("apply")),
            "resolved": sum(1 for item in plan if item.get("resolved")),
            "lowConfidence": sum(1 for item in plan if item.get("note") == "lowConfidence"),
            "inferred": sum(1 for item in plan if item.get("method") == "inferred"),
        },
    }
