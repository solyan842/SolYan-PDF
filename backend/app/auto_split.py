from __future__ import annotations

import io
import shutil
import subprocess
import tempfile
import zipfile
from pathlib import Path

MAX_AUTO_SPLIT_PAGES = 300
COMMAND_TIMEOUT_SECONDS = 120


def normalize_dividers(values: list[object], page_count: int) -> list[int]:
    if page_count < 1 or page_count > MAX_AUTO_SPLIT_PAGES:
        raise ValueError(f"Auto Split page count must be between 1 and {MAX_AUTO_SPLIT_PAGES}")

    pages: set[int] = set()
    for value in values:
        try:
            page = int(value)
        except (TypeError, ValueError) as exc:
            raise ValueError(f"Invalid divider page: {value!r}") from exc
        if page < 1 or page > page_count:
            raise ValueError(f"Divider page {page} is outside 1-{page_count}")
        pages.add(page)
    return sorted(pages)


def build_split_groups(page_count: int, dividers: list[object], duplex: bool = False) -> list[list[int]]:
    """Build physical-page groups, excluding divider sheets and optional backs.

    A divider always closes the current document and is never included in output.
    In duplex mode the physical page immediately following a divider is skipped
    as the back side of that divider. Consecutive dividers never create empty PDFs.
    """

    divider_pages = normalize_dividers(dividers, page_count)
    divider_set = set(divider_pages)
    skipped_back_pages = {
        page + 1 for page in divider_pages if duplex and page + 1 <= page_count
    }

    groups: list[list[int]] = []
    current: list[int] = []
    for page in range(1, page_count + 1):
        if page in divider_set:
            if current:
                groups.append(current)
                current = []
            continue
        if page in skipped_back_pages:
            continue
        current.append(page)

    if current:
        groups.append(current)
    if not groups:
        raise ValueError("No content pages remain after removing divider sheets")
    return groups


def compress_page_ranges(pages: list[int]) -> str:
    if not pages:
        raise ValueError("Cannot create an empty page range")
    ranges: list[str] = []
    start = previous = pages[0]
    for page in pages[1:]:
        if page == previous + 1:
            previous = page
            continue
        ranges.append(str(start) if start == previous else f"{start}-{previous}")
        start = previous = page
    ranges.append(str(start) if start == previous else f"{start}-{previous}")
    return ",".join(ranges)


def _write_selected_pages(input_path: Path, output_path: Path, pages: list[int]) -> None:
    if shutil.which("qpdf") is None:
        raise RuntimeError("qpdf engine is unavailable")
    page_range = compress_page_ranges(pages)
    result = subprocess.run(
        ["qpdf", str(input_path), "--pages", ".", page_range, "--", str(output_path)],
        capture_output=True,
        text=True,
        timeout=COMMAND_TIMEOUT_SECONDS,
    )
    if result.returncode not in (0, 3):
        detail = (result.stderr or result.stdout or "qpdf page selection failed").strip()[-1200:]
        raise RuntimeError(detail)
    if not output_path.exists():
        raise RuntimeError("qpdf did not produce an Auto Split part")


def split_pdf_to_zip(data: bytes, groups: list[list[int]], page_count: int) -> bytes:
    """Split with qpdf and package parts without rasterizing page contents."""

    if not data.startswith(b"%PDF-"):
        raise ValueError("Auto Split input is not a PDF")
    if not groups:
        raise ValueError("Auto Split has no output groups")

    all_pages = list(range(1, page_count + 1))
    with tempfile.TemporaryDirectory(prefix="solyan-auto-split-") as temp_dir:
        root = Path(temp_dir)
        input_path = root / "input.pdf"
        input_path.write_bytes(data)

        stream = io.BytesIO()
        with zipfile.ZipFile(stream, "w", compression=zipfile.ZIP_STORED) as archive:
            for index, pages in enumerate(groups, start=1):
                filename = f"solyan-auto-split-{index:03d}.pdf"
                if len(groups) == 1 and pages == all_pages:
                    # Exact byte preservation when no divider was detected.
                    archive.writestr(filename, data)
                    continue
                output_path = root / filename
                _write_selected_pages(input_path, output_path, pages)
                archive.write(output_path, arcname=filename)
        return stream.getvalue()
