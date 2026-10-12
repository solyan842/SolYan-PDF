from __future__ import annotations

import json
import os
import shutil
import tempfile
import threading
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, HTTPException, UploadFile

MAX_FILE_SIZE = int(os.getenv("OCR_MAX_FILE_SIZE", str(50 * 1024 * 1024)))
SUPPORTED_SUFFIXES = {".pdf", ".png", ".jpg", ".jpeg", ".webp", ".tif", ".tiff", ".bmp"}
IMAGE_SUFFIXES = SUPPORTED_SUFFIXES - {".pdf"}

app = FastAPI(title="SolYan OCR Service", version="0.2.0")

_ocr_pipeline: Any | None = None
_structure_pipeline: Any | None = None
_model_lock = threading.Lock()


def _load_ocr() -> Any:
    global _ocr_pipeline
    if _ocr_pipeline is None:
        with _model_lock:
            if _ocr_pipeline is None:
                from paddleocr import PaddleOCR

                _ocr_pipeline = PaddleOCR(
                    lang=os.getenv("OCR_LANG", "vi"),
                    use_doc_orientation_classify=True,
                    use_doc_unwarping=True,
                    use_textline_orientation=True,
                    engine="paddle",
                )
    return _ocr_pipeline


def _load_structure() -> Any:
    global _structure_pipeline
    if _structure_pipeline is None:
        with _model_lock:
            if _structure_pipeline is None:
                from paddleocr import PPStructureV3

                _structure_pipeline = PPStructureV3(
                    use_doc_orientation_classify=True,
                    use_doc_unwarping=True,
                    engine="paddle",
                )
    return _structure_pipeline


def _read_upload(upload: UploadFile) -> tuple[bytes, str]:
    suffix = Path(upload.filename or "document.bin").suffix.lower()
    if suffix not in SUPPORTED_SUFFIXES:
        raise HTTPException(status_code=400, detail=f"Unsupported input type: {suffix or 'unknown'}")
    data = upload.file.read(MAX_FILE_SIZE + 1)
    if len(data) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail=f"Input exceeds {MAX_FILE_SIZE // (1024 * 1024)} MB limit")
    if not data:
        raise HTTPException(status_code=400, detail="Empty upload")
    return data, suffix


def _json_safe(value: Any) -> Any:
    if isinstance(value, dict):
        return {str(k): _json_safe(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_safe(v) for v in value]
    if hasattr(value, "tolist"):
        return _json_safe(value.tolist())
    if isinstance(value, Path):
        return str(value)
    try:
        json.dumps(value)
        return value
    except TypeError:
        return str(value)


def _result_json(result: Any) -> dict[str, Any]:
    payload = getattr(result, "json", None)
    if callable(payload):
        payload = payload()
    if payload is None:
        payload = getattr(result, "res", None)
    if payload is None:
        payload = {"result": str(result)}
    return _json_safe(payload)


def _extract_text(payloads: list[dict[str, Any]]) -> str:
    lines: list[str] = []

    def walk(value: Any) -> None:
        if isinstance(value, dict):
            for key, child in value.items():
                if key in {"rec_texts", "rec_text", "text", "content"}:
                    if isinstance(child, list):
                        lines.extend(str(item) for item in child if str(item).strip())
                    elif str(child).strip():
                        lines.append(str(child))
                else:
                    walk(child)
        elif isinstance(value, list):
            for child in value:
                walk(child)

    for payload in payloads:
        walk(payload)
    return "\n".join(dict.fromkeys(lines))


def _tesseract_enabled() -> bool:
    return os.getenv("OCR_TESSERACT_FALLBACK", "1").strip().lower() not in {"0", "false", "no", "off"}


def _tesseract_text(input_path: Path, suffix: str) -> tuple[str, list[dict[str, Any]]]:
    import pytesseract
    from PIL import Image

    lang = os.getenv("TESSERACT_LANG", "vie+eng")
    images: list[Any] = []
    if suffix == ".pdf":
        import pypdfium2 as pdfium

        pdf = pdfium.PdfDocument(str(input_path))
        try:
            for index in range(len(pdf)):
                page = pdf[index]
                bitmap = page.render(scale=2.2)
                images.append(bitmap.to_pil())
        finally:
            pdf.close()
    else:
        images.append(Image.open(input_path).convert("RGB"))

    pages: list[dict[str, Any]] = []
    texts: list[str] = []
    try:
        for index, image in enumerate(images, start=1):
            text = pytesseract.image_to_string(image, lang=lang).strip()
            texts.append(text)
            pages.append({"page": index, "text": text, "engine": "tesseract", "language": lang})
    finally:
        for image in images:
            closer = getattr(image, "close", None)
            if callable(closer):
                closer()
    return "\n\n".join(text for text in texts if text), pages


@app.get("/health")
def health() -> dict[str, object]:
    return {
        "status": "ok",
        "engine": "PaddleOCR",
        "models_loaded": {"ocr": _ocr_pipeline is not None, "structure": _structure_pipeline is not None},
        "fallback": {
            "enabled": _tesseract_enabled(),
            "engine": "Tesseract",
            "binary_available": shutil.which("tesseract") is not None,
            "language": os.getenv("TESSERACT_LANG", "vie+eng"),
        },
    }


@app.post("/ocr/text")
def ocr_text(file: UploadFile = File(...)) -> dict[str, Any]:
    data, suffix = _read_upload(file)
    with tempfile.TemporaryDirectory(prefix="solyan-ocr-") as temp_dir:
        input_path = Path(temp_dir) / f"input{suffix}"
        input_path.write_bytes(data)
        try:
            results = list(_load_ocr().predict(str(input_path)))
            pages = [_result_json(result) for result in results]
            return {"mode": "text", "engine": "PaddleOCR", "pages": pages, "text": _extract_text(pages), "fallback_used": False}
        except Exception as paddle_exc:
            if not _tesseract_enabled():
                raise HTTPException(status_code=422, detail=f"OCR failed: {paddle_exc}") from paddle_exc
            try:
                text, pages = _tesseract_text(input_path, suffix)
                return {
                    "mode": "text",
                    "engine": "Tesseract",
                    "pages": pages,
                    "text": text,
                    "fallback_used": True,
                    "primary_error": str(paddle_exc)[:1200],
                }
            except Exception as fallback_exc:
                raise HTTPException(
                    status_code=422,
                    detail=f"PaddleOCR failed ({paddle_exc}); Tesseract fallback failed ({fallback_exc})",
                ) from fallback_exc


@app.post("/ocr/structured")
def ocr_structured(file: UploadFile = File(...)) -> dict[str, Any]:
    data, suffix = _read_upload(file)
    with tempfile.TemporaryDirectory(prefix="solyan-structure-") as temp_dir:
        root = Path(temp_dir)
        input_path = root / f"input{suffix}"
        output_dir = root / "output"
        output_dir.mkdir()
        input_path.write_bytes(data)
        try:
            results = list(_load_structure().predict(input=str(input_path)))
            payloads = [_result_json(result) for result in results]
            for result in results:
                saver = getattr(result, "save_to_markdown", None)
                if callable(saver):
                    saver(save_path=str(output_dir))
        except Exception as exc:
            raise HTTPException(status_code=422, detail=f"Structured OCR failed: {exc}") from exc

        markdown_parts: list[str] = []
        for path in sorted(output_dir.rglob("*.md")):
            try:
                markdown_parts.append(path.read_text(encoding="utf-8"))
            except UnicodeDecodeError:
                continue

        return {
            "mode": "structured",
            "engine": "PP-StructureV3",
            "pages": payloads,
            "markdown": "\n\n---\n\n".join(part for part in markdown_parts if part.strip()),
        }
