from __future__ import annotations

import io
import json
import os
import shutil
import tempfile
import threading
import traceback
from copy import copy
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import Response

MAX_FILE_SIZE = int(os.getenv("OCR_MAX_FILE_SIZE", str(50 * 1024 * 1024)))
SUPPORTED_SUFFIXES = {".pdf", ".png", ".jpg", ".jpeg", ".webp", ".tif", ".tiff", ".bmp"}
IMAGE_SUFFIXES = SUPPORTED_SUFFIXES - {".pdf"}
XLSX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

app = FastAPI(title="SolYan OCR Service", version="0.3.0")

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


def _safe_sheet_name(base: str, used: set[str]) -> str:
    cleaned = "".join("_" if ch in "[]:*?/\\" else ch for ch in base).strip() or "Table"
    cleaned = cleaned[:31]
    candidate = cleaned
    index = 2
    while candidate in used:
        suffix = f"_{index}"
        candidate = f"{cleaned[: 31 - len(suffix)]}{suffix}"
        index += 1
    used.add(candidate)
    return candidate


def _copy_sheet(source: Any, target: Any) -> None:
    for row in source.iter_rows():
        for cell in row:
            dst = target[cell.coordinate]
            dst.value = cell.value
            if cell.has_style:
                dst._style = copy(cell._style)
            if cell.hyperlink:
                dst._hyperlink = copy(cell.hyperlink)
            if cell.comment:
                dst.comment = copy(cell.comment)

    for merged_range in source.merged_cells.ranges:
        target.merge_cells(str(merged_range))

    for key, dimension in source.column_dimensions.items():
        target.column_dimensions[key] = copy(dimension)
    for key, dimension in source.row_dimensions.items():
        target.row_dimensions[key] = copy(dimension)

    target.freeze_panes = source.freeze_panes
    target.sheet_format = copy(source.sheet_format)
    target.sheet_properties = copy(source.sheet_properties)
    target.page_margins = copy(source.page_margins)
    target.page_setup = copy(source.page_setup)
    target.print_options = copy(source.print_options)


def _merge_xlsx_files(generated: list[tuple[int, Path]]) -> bytes:
    from openpyxl import Workbook, load_workbook

    output = Workbook()
    output.remove(output.active)
    used_names: set[str] = set()

    for page_index, path in generated:
        source_book = load_workbook(path, data_only=False)
        try:
            for table_index, source_sheet in enumerate(source_book.worksheets, start=1):
                name = _safe_sheet_name(
                    f"P{page_index}-T{table_index}-{source_sheet.title}",
                    used_names,
                )
                target_sheet = output.create_sheet(name)
                _copy_sheet(source_sheet, target_sheet)
        finally:
            source_book.close()

    if not output.worksheets:
        raise ValueError("PP-StructureV3 produced no table worksheets")

    stream = io.BytesIO()
    output.save(stream)
    output.close()
    return stream.getvalue()


def _structure_results(input_path: Path) -> list[Any]:
    try:
        return list(_load_structure().predict(input=str(input_path)))
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Structured OCR failed: {exc}") from exc


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
        "exports": {"xlsx": True},
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
        results = _structure_results(input_path)
        payloads = [_result_json(result) for result in results]
        try:
            for result in results:
                saver = getattr(result, "save_to_markdown", None)
                if callable(saver):
                    saver(save_path=str(output_dir))
        except Exception as exc:
            raise HTTPException(status_code=422, detail=f"Structured OCR export failed: {exc}") from exc

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


@app.post("/ocr/xlsx")
def ocr_xlsx(file: UploadFile = File(...)) -> Response:
    """Recognize scanned tables and return one XLSX workbook.

    PP-StructureV3 may emit one or more workbooks per page/table. SolYan merges
    those outputs into a single workbook while keeping each recognized table on
    its own worksheet, which makes multi-page scanned PDFs usable as one download.
    """
    data, suffix = _read_upload(file)
    with tempfile.TemporaryDirectory(prefix="solyan-xlsx-") as temp_dir:
        root = Path(temp_dir)
        input_path = root / f"input{suffix}"
        output_dir = root / "tables"
        output_dir.mkdir()
        input_path.write_bytes(data)

        results = _structure_results(input_path)
        generated: list[tuple[int, Path]] = []
        for page_index, result in enumerate(results, start=1):
            saver = getattr(result, "save_to_xlsx", None)
            if not callable(saver):
                continue
            page_dir = output_dir / f"page-{page_index:03d}"
            page_dir.mkdir()
            try:
                saver(save_path=str(page_dir))
            except Exception as exc:
                raise HTTPException(
                    status_code=422,
                    detail=f"PP-StructureV3 XLSX export failed on page {page_index}: {exc}",
                ) from exc
            generated.extend((page_index, path) for path in sorted(page_dir.rglob("*.xlsx")))

        if not generated:
            raise HTTPException(status_code=422, detail="PP-StructureV3 found no exportable tables")

        try:
            workbook = _merge_xlsx_files(generated)
        except Exception as exc:
            traceback.print_exc()
            generated_names = ", ".join(f"page={page_index}:{path.name}" for page_index, path in generated)
            raise HTTPException(
                status_code=422,
                detail=(
                    f"Unable to assemble OCR XLSX workbook: {type(exc).__name__}: {exc}; "
                    f"generated=[{generated_names}]"
                ),
            ) from exc

        return Response(
            content=workbook,
            media_type=XLSX_MEDIA_TYPE,
            headers={
                "Content-Disposition": 'attachment; filename="solyan-ocr-tables.xlsx"',
                "X-SolYan-OCR-Engine": "PP-StructureV3",
                "X-SolYan-OCR-Pages": str(len(results)),
                "X-SolYan-OCR-Table-Workbooks": str(len(generated)),
            },
        )
