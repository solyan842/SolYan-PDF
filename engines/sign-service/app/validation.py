from __future__ import annotations

import io
from datetime import datetime
from typing import Any

from fastapi import APIRouter, File, HTTPException, UploadFile
from pyhanko.pdf_utils.reader import PdfFileReader
from pyhanko.sign.validation import validate_pdf_signature
from pyhanko_certvalidator import ValidationContext

router = APIRouter()

MAX_PDF_SIZE = 100 * 1024 * 1024
MAX_SIGNATURE_COUNT = 50


def _read_pdf(upload: UploadFile) -> bytes:
    data = upload.file.read(MAX_PDF_SIZE + 1)
    if len(data) > MAX_PDF_SIZE:
        raise HTTPException(status_code=413, detail="PDF exceeds 100 MB limit")
    if not data:
        raise HTTPException(status_code=400, detail="Empty PDF")
    if not data.startswith(b"%PDF-"):
        raise HTTPException(status_code=400, detail="Uploaded document is not a PDF")
    return data


def _enum_text(value: Any) -> str | None:
    if value is None:
        return None
    name = getattr(value, "name", None)
    if name:
        return str(name)
    return str(value)


def _iso(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.isoformat()
    native = getattr(value, "native", None)
    if isinstance(native, datetime):
        return native.isoformat()
    try:
        return str(value)
    except Exception:
        return None


def _cert_time(cert: Any, key: str) -> str | None:
    try:
        value = cert["tbs_certificate"]["validity"][key].native
    except Exception:
        return None
    return _iso(value)


def _cert_info(cert: Any) -> dict[str, Any]:
    if cert is None:
        return {}
    try:
        subject = cert.subject.human_friendly
    except Exception:
        subject = None
    try:
        issuer = cert.issuer.human_friendly
    except Exception:
        issuer = None
    try:
        serial_number = str(cert.serial_number)
    except Exception:
        serial_number = None
    try:
        sha256 = cert.sha256_fingerprint
    except Exception:
        sha256 = None
    return {
        "subject": subject,
        "issuer": issuer,
        "serial_number": serial_number,
        "sha256_fingerprint": sha256,
        "not_valid_before": _cert_time(cert, "not_before"),
        "not_valid_after": _cert_time(cert, "not_after"),
    }


def _validate_signature(embedded_sig: Any) -> dict[str, Any]:
    # Disable network fetching for deterministic/self-hosted validation. The
    # validator may still use the platform trust store for path building.
    context = ValidationContext(allow_fetching=False)
    signer_cert = getattr(embedded_sig, "signer_cert", None)
    base = {
        "field_name": getattr(embedded_sig, "field_name", None),
        "signature_type": str(getattr(embedded_sig, "sig_object_type", "")) or None,
        "signing_time": _iso(getattr(embedded_sig, "self_reported_timestamp", None)),
        "certificate": _cert_info(signer_cert),
    }

    try:
        status = validate_pdf_signature(
            embedded_sig,
            signer_validation_context=context,
        )
    except Exception as exc:
        # Parsing the signature itself succeeded, but full validation did not.
        # Keep signer metadata and return an explicit validator error instead of
        # turning an untrusted/unsupported signature into a server failure.
        return {
            **base,
            "intact": False,
            "cryptographically_valid": False,
            "trusted": False,
            "bottom_line": False,
            "trust_problem": None,
            "coverage": None,
            "modification_level": None,
            "docmdp_ok": None,
            "digest_algorithm": None,
            "signature_mechanism": None,
            "validation_error": str(exc)[:2000],
        }

    trust_problem = getattr(status, "trust_problem_indic", None)
    validation_path = getattr(status, "validation_path", None)
    trusted = trust_problem is None and validation_path is not None
    try:
        details = status.pretty_print_details()
    except Exception:
        details = None

    return {
        **base,
        "intact": bool(getattr(status, "intact", False)),
        "cryptographically_valid": bool(getattr(status, "valid", False)),
        "trusted": trusted,
        "bottom_line": bool(getattr(status, "bottom_line", False)),
        "trust_problem": _enum_text(trust_problem),
        "coverage": _enum_text(getattr(status, "coverage", None)),
        "modification_level": _enum_text(getattr(status, "modification_level", None)),
        "docmdp_ok": getattr(status, "docmdp_ok", None),
        "digest_algorithm": getattr(status, "md_algorithm", None),
        "signature_mechanism": getattr(status, "pkcs7_signature_mechanism", None),
        "validation_error": None,
        "details": str(details)[:6000] if details else None,
    }


@router.post("/validate")
def validate_signatures(file: UploadFile = File(...)) -> dict[str, Any]:
    pdf_data = _read_pdf(file)
    try:
        reader = PdfFileReader(io.BytesIO(pdf_data), strict=False)
        signatures = list(reader.embedded_signatures)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Không đọc được cấu trúc chữ ký PDF: {exc}") from exc

    if len(signatures) > MAX_SIGNATURE_COUNT:
        raise HTTPException(status_code=413, detail=f"PDF exceeds {MAX_SIGNATURE_COUNT} embedded signatures")

    results = [_validate_signature(signature) for signature in signatures]
    return {
        "signature_count": len(results),
        "all_intact": bool(results) and all(item["intact"] for item in results),
        "all_cryptographically_valid": bool(results) and all(item["cryptographically_valid"] for item in results),
        "all_trusted": bool(results) and all(item["trusted"] for item in results),
        "all_bottom_line": bool(results) and all(item["bottom_line"] for item in results),
        "network_fetching": False,
        "signatures": results,
    }
