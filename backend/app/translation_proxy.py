from __future__ import annotations

import json
import os
import re
import time

import httpx
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import Response

router = APIRouter(prefix="/pdf", tags=["PDF translation"])

LANG_RE = re.compile(r"^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$")
TASK_ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,128}$")
SERVICE_ID_RE = re.compile(r"^[a-z0-9_-]{1,64}$")
OUTPUT_MODES = {"translated": "mono", "bilingual": "dual"}
SERVICES_REQUIRING_OPERATOR_CONFIGURATION = frozenset({"argos", "ollama", "openai", "deepl"})
SERVICES_REQUIRING_CREDENTIALS = frozenset({"openai", "deepl"})


def _parse_upstream_service_map(raw: str) -> dict[str, str]:
    mapping: dict[str, str] = {}
    for item in raw.split(","):
        value = item.strip().lower()
        if not value:
            continue
        if value.count(":") != 1:
            raise RuntimeError("TRANSLATION_UPSTREAM_SERVICE_MAP entries must use public:upstream syntax")
        public_service, upstream_service = (part.strip() for part in value.split(":", 1))
        if not SERVICE_ID_RE.fullmatch(public_service) or not SERVICE_ID_RE.fullmatch(upstream_service):
            raise RuntimeError("TRANSLATION_UPSTREAM_SERVICE_MAP contains an invalid service identifier")
        mapping[public_service] = upstream_service
    return mapping


TRANSLATION_SERVICE_URL = os.getenv("TRANSLATION_SERVICE_URL", "http://translation-service:11008").rstrip("/")
TRANSLATION_MAX_FILE_SIZE = int(os.getenv("TRANSLATION_MAX_FILE_SIZE", str(100 * 1024 * 1024)))
TRANSLATION_TIMEOUT_SECONDS = int(os.getenv("TRANSLATION_TIMEOUT_SECONDS", "900"))
TRANSLATION_POLL_INTERVAL_SECONDS = float(os.getenv("TRANSLATION_POLL_INTERVAL_SECONDS", "1.0"))
TRANSLATION_DEFAULT_SERVICE = os.getenv("TRANSLATION_DEFAULT_SERVICE", "argos").strip().lower() or "argos"
TRANSLATION_ALLOWED_SERVICES = tuple(
    item.strip().lower()
    for item in os.getenv(
        "TRANSLATION_ALLOWED_SERVICES",
        "argos,ollama,openai,deepl,google,bing",
    ).split(",")
    if item.strip()
)
TRANSLATION_LOCAL_SERVICES = frozenset(
    item.strip().lower()
    for item in os.getenv("TRANSLATION_LOCAL_SERVICES", "argos,ollama").split(",")
    if item.strip()
)
TRANSLATION_UPSTREAM_SERVICE_MAP = _parse_upstream_service_map(
    os.getenv("TRANSLATION_UPSTREAM_SERVICE_MAP", "")
)

if not SERVICE_ID_RE.fullmatch(TRANSLATION_DEFAULT_SERVICE):
    raise RuntimeError("TRANSLATION_DEFAULT_SERVICE contains an invalid service identifier")
if TRANSLATION_DEFAULT_SERVICE not in TRANSLATION_ALLOWED_SERVICES:
    raise RuntimeError("TRANSLATION_DEFAULT_SERVICE must be present in TRANSLATION_ALLOWED_SERVICES")
if any(not SERVICE_ID_RE.fullmatch(service) for service in TRANSLATION_ALLOWED_SERVICES):
    raise RuntimeError("TRANSLATION_ALLOWED_SERVICES contains an invalid service identifier")
if not set(TRANSLATION_LOCAL_SERVICES).issubset(TRANSLATION_ALLOWED_SERVICES):
    raise RuntimeError("TRANSLATION_LOCAL_SERVICES must be a subset of TRANSLATION_ALLOWED_SERVICES")
if not set(TRANSLATION_UPSTREAM_SERVICE_MAP).issubset(TRANSLATION_ALLOWED_SERVICES):
    raise RuntimeError("TRANSLATION_UPSTREAM_SERVICE_MAP keys must be public allowed services")


def _read_pdf(upload: UploadFile) -> bytes:
    data = upload.file.read(TRANSLATION_MAX_FILE_SIZE + 1)
    if len(data) > TRANSLATION_MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="PDF exceeds translation size limit")
    if not data:
        raise HTTPException(status_code=400, detail="Empty PDF")
    if not data.startswith(b"%PDF-"):
        raise HTTPException(status_code=400, detail="Uploaded document is not a PDF")
    return data


def _validate_language(code: str, field: str) -> str:
    value = code.strip()
    if not LANG_RE.fullmatch(value):
        raise HTTPException(status_code=422, detail=f"{field} must be an ISO-style language code")
    return value


def _validate_service(service: str | None) -> str:
    value = (service or TRANSLATION_DEFAULT_SERVICE).strip().lower()
    if value not in TRANSLATION_ALLOWED_SERVICES:
        allowed = ", ".join(TRANSLATION_ALLOWED_SERVICES)
        raise HTTPException(status_code=422, detail=f"translation service must be one of: {allowed}")
    return value


def _upstream_service(public_service: str) -> str:
    return TRANSLATION_UPSTREAM_SERVICE_MAP.get(public_service, public_service)


def _cancel_task(client: httpx.Client, task_id: str) -> None:
    if not TASK_ID_RE.fullmatch(task_id):
        return
    try:
        client.delete(f"{TRANSLATION_SERVICE_URL}/v1/translate/{task_id}", timeout=5.0)
    except httpx.HTTPError:
        pass


@router.get("/translate/capabilities")
def translation_capabilities() -> dict:
    services = [
        {
            "id": service,
            "local": service in TRANSLATION_LOCAL_SERVICES,
            "requires_operator_configuration": service in SERVICES_REQUIRING_OPERATOR_CONFIGURATION,
            "requires_credentials": service in SERVICES_REQUIRING_CREDENTIALS,
        }
        for service in TRANSLATION_ALLOWED_SERVICES
    ]
    return {
        "engine": "PDFMathTranslate-compatible HTTP adapter",
        "service_configured": bool(TRANSLATION_SERVICE_URL),
        "default_service": TRANSLATION_DEFAULT_SERVICE,
        "services": services,
        "output_modes": list(OUTPUT_MODES),
        "max_file_size": TRANSLATION_MAX_FILE_SIZE,
        "privacy": {
            "local_services": sorted(TRANSLATION_LOCAL_SERVICES),
            "local_classification_is_operator_configured": True,
            "cloud_services_may_send_document_text_off_device": True,
            "api_keys_are_not_accepted_from_browser": True,
            "provider_aliasing_is_server_side": True,
        },
    }


@router.post("/translate")
def translate_pdf(
    file: UploadFile = File(...),
    source_language: str = Form(default="en"),
    target_language: str = Form(default="vi"),
    service: str | None = Form(default=None),
    output_mode: str = Form(default="translated"),
    thread_count: int = Form(default=2, ge=1, le=8),
) -> Response:
    data = _read_pdf(file)
    lang_in = _validate_language(source_language, "source_language")
    lang_out = _validate_language(target_language, "target_language")
    selected_service = _validate_service(service)
    upstream_output = OUTPUT_MODES.get(output_mode)
    if upstream_output is None:
        raise HTTPException(status_code=422, detail="output_mode must be translated or bilingual")
    if lang_in.lower() == lang_out.lower():
        raise HTTPException(status_code=422, detail="source and target languages must differ")

    request_payload = {
        "lang_in": lang_in,
        "lang_out": lang_out,
        "service": _upstream_service(selected_service),
        "thread": thread_count,
    }

    timeout = httpx.Timeout(30.0, connect=10.0)
    try:
        with httpx.Client(timeout=timeout) as client:
            submit = client.post(
                f"{TRANSLATION_SERVICE_URL}/v1/translate",
                files={"file": (file.filename or "document.pdf", data, "application/pdf")},
                data={"data": json.dumps(request_payload, ensure_ascii=False)},
            )
            if submit.status_code >= 400:
                raise HTTPException(status_code=502, detail="Translation service rejected the task")
            try:
                task_id = str(submit.json().get("id", ""))
            except (ValueError, AttributeError) as exc:
                raise HTTPException(status_code=502, detail="Translation service returned an invalid task response") from exc
            if not TASK_ID_RE.fullmatch(task_id):
                raise HTTPException(status_code=502, detail="Translation service returned an invalid task id")

            deadline = time.monotonic() + TRANSLATION_TIMEOUT_SECONDS
            try:
                while True:
                    if time.monotonic() >= deadline:
                        raise HTTPException(status_code=504, detail="PDF translation timed out")
                    status_response = client.get(f"{TRANSLATION_SERVICE_URL}/v1/translate/{task_id}")
                    if status_response.status_code >= 400:
                        raise HTTPException(status_code=502, detail="Translation status request failed")
                    try:
                        status_payload = status_response.json()
                    except ValueError as exc:
                        raise HTTPException(status_code=502, detail="Translation service returned invalid status JSON") from exc
                    state = str(status_payload.get("state", "")).upper()
                    if state == "SUCCESS":
                        break
                    if state in {"FAILURE", "REVOKED"}:
                        raise HTTPException(status_code=502, detail="Translation task failed")
                    time.sleep(max(0.2, TRANSLATION_POLL_INTERVAL_SECONDS))

                result_response = client.get(
                    f"{TRANSLATION_SERVICE_URL}/v1/translate/{task_id}/{upstream_output}",
                    timeout=httpx.Timeout(120.0, connect=10.0),
                )
                if result_response.status_code >= 400:
                    raise HTTPException(status_code=502, detail="Translation result download failed")
                result = result_response.content
                if not result.startswith(b"%PDF-"):
                    raise HTTPException(status_code=502, detail="Translation service returned a non-PDF result")
            finally:
                _cancel_task(client, task_id)
    except HTTPException:
        raise
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=503, detail="PDF translation service is unavailable") from exc

    filename = "solyan-translated-bilingual.pdf" if output_mode == "bilingual" else "solyan-translated.pdf"
    return Response(
        content=result,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "X-SolYan-Translation-Engine": "pdf2zh-http",
            "X-SolYan-Translation-Service": selected_service,
            "X-SolYan-Translation-Mode": output_mode,
            "X-SolYan-Translation-Local": "1" if selected_service in TRANSLATION_LOCAL_SERVICES else "0",
        },
    )
