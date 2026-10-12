from __future__ import annotations

import os
import time

import httpx
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import Response

router = APIRouter(prefix="/experimental", tags=["Experimental conversion"])
BLOOM_SERVICE_URL = os.getenv("BLOOM_SERVICE_URL", "http://bloom-service:8787").rstrip("/")
BLOOM_API_KEY = os.getenv("BLOOM_API_KEY", "")
MAX_FILE_SIZE = int(os.getenv("BLOOM_PROXY_MAX_FILE_SIZE", str(100 * 1024 * 1024)))
TARGETS = {"docx", "xlsx", "pptx"}


def _headers() -> dict[str, str]:
    return {"x-api-key": BLOOM_API_KEY} if BLOOM_API_KEY else {}


@router.get("/bloom/health")
def bloom_health() -> dict:
    try:
        response = httpx.get(f"{BLOOM_SERVICE_URL}/health", headers=_headers(), timeout=8.0)
        response.raise_for_status()
        return response.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(status_code=503, detail="Bloom conversion service is unavailable") from exc


@router.post("/pdf-to-office")
def pdf_to_office(
    file: UploadFile = File(...),
    target: str = Form(default="docx"),
) -> Response:
    if target not in TARGETS:
        raise HTTPException(status_code=400, detail="Target must be docx, xlsx or pptx")
    data = file.file.read(MAX_FILE_SIZE + 1)
    if len(data) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="PDF exceeds 100 MB limit")
    if not data.startswith(b"%PDF-"):
        raise HTTPException(status_code=400, detail="Uploaded file is not a PDF")

    headers = _headers()
    try:
        with httpx.Client(timeout=httpx.Timeout(180.0, connect=10.0), headers=headers) as client:
            created = client.post(
                f"{BLOOM_SERVICE_URL}/convert",
                files={"file": (file.filename or "document.pdf", data, "application/pdf")},
                data={"target": target},
            )
            if created.status_code != 202:
                raise HTTPException(status_code=502, detail=f"Bloom create job failed: {created.text[:1000]}")
            payload = created.json()
            job_id = payload.get("job", {}).get("id")
            if not job_id:
                raise HTTPException(status_code=502, detail="Bloom did not return a job id")

            deadline = time.monotonic() + 170
            while time.monotonic() < deadline:
                status = client.get(f"{BLOOM_SERVICE_URL}/jobs/{job_id}")
                status.raise_for_status()
                job = status.json().get("job", {})
                state = job.get("state")
                if state == "Completed":
                    result = client.get(f"{BLOOM_SERVICE_URL}/download/{job_id}")
                    result.raise_for_status()
                    disposition = result.headers.get("content-disposition", f'attachment; filename="solyan-converted.{target}"')
                    return Response(
                        content=result.content,
                        media_type=result.headers.get("content-type", "application/octet-stream"),
                        headers={"Content-Disposition": disposition},
                    )
                if state in {"Failed", "Cancelled"}:
                    raise HTTPException(status_code=422, detail=f"Bloom conversion {state.lower()}: {job.get('error') or 'unknown error'}")
                time.sleep(0.75)
    except HTTPException:
        raise
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(status_code=503, detail="Bloom conversion service is unavailable") from exc

    raise HTTPException(status_code=504, detail="Bloom conversion timed out")
