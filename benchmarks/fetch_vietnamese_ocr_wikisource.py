from __future__ import annotations

import argparse
import hashlib
import json
import re
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from html.parser import HTMLParser
from pathlib import Path

import pypdfium2 as pdfium

DEFAULT_MANIFEST = Path(__file__).parent / "corpora" / "vietnamese_real_wikisource_v1.json"
USER_AGENT = "SolYan-PDF OCR benchmark/0.1.2 (https://github.com/solyan842/SolYan-PDF)"
BLOCK_TAGS = {
    "address",
    "article",
    "aside",
    "blockquote",
    "br",
    "dd",
    "div",
    "dl",
    "dt",
    "figcaption",
    "figure",
    "footer",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "header",
    "hr",
    "li",
    "main",
    "nav",
    "ol",
    "p",
    "pre",
    "section",
    "table",
    "tbody",
    "td",
    "tfoot",
    "th",
    "thead",
    "tr",
    "ul",
}
SKIP_TAGS = {"script", "style"}


class VisibleTextParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self.skip_depth = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        tag = tag.lower()
        if tag in SKIP_TAGS:
            self.skip_depth += 1
            return
        if self.skip_depth == 0 and tag in BLOCK_TAGS:
            self.parts.append(" ")

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        if tag in SKIP_TAGS:
            self.skip_depth = max(0, self.skip_depth - 1)
            return
        if self.skip_depth == 0 and tag in BLOCK_TAGS:
            self.parts.append(" ")

    def handle_data(self, data: str) -> None:
        if self.skip_depth == 0 and data:
            self.parts.append(data)

    def text(self) -> str:
        value = "".join(self.parts).replace("\xa0", " ").replace("\u200b", "")
        return re.sub(r"\s+", " ", value).strip()


def request_bytes(url: str, timeout: int = 180, attempts: int = 5) -> bytes:
    last_error: Exception | None = None
    for attempt in range(attempts):
        request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                return response.read()
        except urllib.error.HTTPError as exc:
            last_error = exc
            if exc.code not in {429, 500, 502, 503, 504} or attempt + 1 >= attempts:
                raise
            retry_after = exc.headers.get("Retry-After")
            delay = float(retry_after) if retry_after and retry_after.isdigit() else min(2 ** attempt, 8)
            time.sleep(delay)
        except urllib.error.URLError as exc:
            last_error = exc
            if attempt + 1 >= attempts:
                raise
            time.sleep(min(2 ** attempt, 8))
    raise RuntimeError(f"Request failed: {url}") from last_error


def api_json(api: str, params: dict[str, object]) -> dict:
    query = urllib.parse.urlencode({key: str(value) for key, value in params.items()})
    return json.loads(request_bytes(f"{api}?{query}", timeout=60).decode("utf-8"))


def fetch_revision(api: str, revid: int, expected_title: str, minimum_quality: int) -> dict:
    payload = api_json(
        api,
        {
            "action": "query",
            "format": "json",
            "formatversion": 2,
            "prop": "revisions",
            "revids": revid,
            "rvprop": "ids|timestamp|content",
            "rvslots": "main",
        },
    )
    pages = payload.get("query", {}).get("pages", [])
    if len(pages) != 1:
        raise RuntimeError(f"Unexpected revision response for {revid}: {payload}")
    page = pages[0]
    if page.get("title") != expected_title:
        raise RuntimeError(f"Revision {revid} belongs to {page.get('title')!r}, expected {expected_title!r}")
    revision = page.get("revisions", [{}])[0]
    if revision.get("revid") != revid:
        raise RuntimeError(f"Revision mismatch for {expected_title}: {revision.get('revid')} != {revid}")
    content = revision.get("slots", {}).get("main", {}).get("content", "")
    match = re.search(r'<pagequality\s+level="(\d+)"', content)
    quality = int(match.group(1)) if match else 0
    if quality < minimum_quality:
        raise RuntimeError(f"{expected_title} revision {revid} quality={quality}, expected >= {minimum_quality}")
    return {"timestamp": revision.get("timestamp"), "quality": quality}


def fetch_rendered_text(api: str, revid: int) -> str:
    payload = api_json(
        api,
        {
            "action": "parse",
            "format": "json",
            "formatversion": 2,
            "oldid": revid,
            "prop": "text",
            "disableeditsection": 1,
            "disabletoc": 1,
        },
    )
    html = payload.get("parse", {}).get("text", "")
    if not isinstance(html, str) or not html.strip():
        raise RuntimeError(f"No rendered Wikisource text for revision {revid}")
    parser = VisibleTextParser()
    parser.feed(html)
    parser.close()
    text = parser.text()
    if len(text) < 100:
        raise RuntimeError(f"Rendered Wikisource text too short for revision {revid}: {len(text)} chars")
    return text


def render_page(document: pdfium.PdfDocument, page_number: int, output: Path, scale: float) -> None:
    index = page_number - 1
    if index < 0 or index >= len(document):
        raise RuntimeError(f"Scan page {page_number} is outside PDF page count {len(document)}")
    page = document[index]
    try:
        bitmap = page.render(scale=scale)
        image = bitmap.to_pil().convert("RGB")
        image.save(output, format="PNG", optimize=True)
    finally:
        page.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Fetch pinned proofread Vietnamese Wikisource real-scan OCR corpus.")
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    parser.add_argument("--output", type=Path, default=Path(".cache/vn-ocr-wikisource"))
    parser.add_argument("--limit-per-source", type=int, default=0, help="0 = all locked pages")
    parser.add_argument("--scale", type=float, default=2.0)
    args = parser.parse_args()

    manifest_path = args.manifest.resolve()
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest.get("schema_version") != 1:
        raise RuntimeError(f"Unsupported manifest schema: {manifest.get('schema_version')}")
    api = manifest["transcription_api"]
    minimum_quality = int(manifest["minimum_page_quality"])
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)

    corpus: list[dict] = []
    attribution: dict[str, object] = {
        "corpus": manifest.get("id"),
        "transcription_license": manifest.get("transcription_license"),
        "note": "Transcriptions are fetched at benchmark time and are not vendored in the Apache-2.0 SolYan PDF source tree.",
        "sources": [],
    }

    with tempfile.TemporaryDirectory(prefix="solyan-wikisource-") as temp_dir:
        temp_root = Path(temp_dir)
        for source in manifest["sources"]:
            selected = list(source["pages"])
            if args.limit_per_source > 0:
                selected = selected[: args.limit_per_source]
            if not selected:
                continue

            pdf_bytes = request_bytes(source["download_url"], timeout=240)
            digest = hashlib.sha256(pdf_bytes).hexdigest()
            if digest != source["sha256"]:
                raise RuntimeError(f"Scan SHA256 mismatch for {source['id']}: {digest} != {source['sha256']}")
            pdf_path = temp_root / f"{source['id']}.pdf"
            pdf_path.write_bytes(pdf_bytes)
            document = pdfium.PdfDocument(str(pdf_path))
            try:
                source_attribution = {
                    "id": source["id"],
                    "work": source["work"],
                    "scan_source_url": source["source_url"],
                    "scan_sha256": source["sha256"],
                    "scan_license": source["scan_license"],
                    "index": source["index"],
                    "pages": [],
                }
                for locked in selected:
                    number = int(locked["page"])
                    revid = int(locked["revid"])
                    title = f"Trang:{source['file']}/{number}"
                    revision = fetch_revision(api, revid, title, minimum_quality)
                    expected = fetch_rendered_text(api, revid)
                    filename = f"wikisource-{source['id']}-p{number:03d}.png"
                    render_page(document, number, output / filename, args.scale)
                    oldid_url = f"https://vi.wikisource.org/w/index.php?oldid={revid}"
                    record = {
                        "file": filename,
                        "expected": expected,
                        "doc_id": f"wikisource-{source['id']}-p{number:03d}",
                        "title": source["work"],
                        "source_id": source["id"],
                        "scan_page": number,
                        "wikisource_revid": revid,
                        "source_url": oldid_url,
                        "scan_source_url": source["source_url"],
                        "scan_license": source["scan_license"],
                        "transcription_license": manifest["transcription_license"],
                        "page_quality": revision["quality"],
                        "revision_timestamp": revision["timestamp"],
                    }
                    corpus.append(record)
                    source_attribution["pages"].append(
                        {
                            "page": number,
                            "revid": revid,
                            "url": oldid_url,
                            "quality": revision["quality"],
                        }
                    )
                attribution["sources"].append(source_attribution)
            finally:
                document.close()

    if not corpus:
        raise RuntimeError("No Wikisource OCR samples were generated")
    (output / "corpus.jsonl").write_text(
        "\n".join(json.dumps(record, ensure_ascii=False) for record in corpus) + "\n",
        encoding="utf-8",
    )
    (output / "ATTRIBUTION.json").write_text(
        json.dumps(attribution, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    (output / "SOURCE.txt").write_text(
        "SolYan PDF Vietnamese OCR Wikisource real-scan benchmark\n"
        f"Manifest: {manifest_path.name}\n"
        f"Samples: {len(corpus)}\n"
        "Scans: Wikimedia Commons files declared Public Domain in the pinned manifest.\n"
        "Ground truth: exact pinned Vietnamese Wikisource revisions, CC BY-SA 4.0.\n"
        "Generated benchmark files are fetched/rendered at runtime and are not vendored into SolYan PDF.\n",
        encoding="utf-8",
    )
    print(f"Fetched and rendered {len(corpus)} proofread real-scan samples to {output}")


if __name__ == "__main__":
    main()
