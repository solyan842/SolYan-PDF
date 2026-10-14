from __future__ import annotations

from typing import Any

VALID_CORRECTIONS = {90, 180, 270}
MAX_AUTO_ROTATE_PAGES = 300


def qpdf_rotation_args(pages: list[dict[str, Any]]) -> list[str]:
    """Translate a validated orientation plan into relative qpdf page rotations.

    qpdf ``+angle`` rotation composes with any existing page rotation instead of
    overwriting it. Each page is emitted separately to keep page selection exact
    and avoid relying on range compaction semantics.
    """

    args: list[str] = []
    seen_pages: set[int] = set()
    for item in pages:
        if not item.get("apply"):
            continue
        page = int(item.get("page", 0) or 0)
        correction = int(item.get("correction", 0) or 0) % 360
        if page < 1 or page > MAX_AUTO_ROTATE_PAGES:
            raise ValueError(f"Invalid Auto Rotate page: {page}")
        if page in seen_pages:
            raise ValueError(f"Duplicate Auto Rotate page: {page}")
        if correction not in VALID_CORRECTIONS:
            raise ValueError(f"Invalid Auto Rotate correction on page {page}: {correction}")
        seen_pages.add(page)
        args.append(f"--rotate=+{correction}:{page}")
    return args
