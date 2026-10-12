from __future__ import annotations

import argparse
import hashlib
import io
import json
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

from pypdf import PdfReader, PdfWriter


USER_AGENT = 'SolYan-PDF PDF-to-Office real-world diagnostic corpus/1'
RETRYABLE_HTTP_STATUS = {429, 500, 502, 503, 504}
MAX_DOWNLOAD_ATTEMPTS = 5


def _retry_delay(error: urllib.error.HTTPError, attempt: int) -> float:
    retry_after = error.headers.get('Retry-After') if error.headers else None
    if retry_after:
        try:
            return min(60.0, max(1.0, float(retry_after)))
        except ValueError:
            pass
    return min(30.0, float(2 ** attempt))


def _read_url(url: str, headers: dict[str, str]) -> tuple[bytes, str]:
    for attempt in range(1, MAX_DOWNLOAD_ATTEMPTS + 1):
        request = urllib.request.Request(url, headers=headers)
        try:
            with urllib.request.urlopen(request, timeout=240) as response:
                return response.read(), response.geturl()
        except urllib.error.HTTPError as error:
            if error.code not in RETRYABLE_HTTP_STATUS or attempt == MAX_DOWNLOAD_ATTEMPTS:
                raise
            delay = _retry_delay(error, attempt)
            print(
                f'RETRY http={error.code} attempt={attempt}/{MAX_DOWNLOAD_ATTEMPTS} '
                f'after={delay:.0f}s url={url}',
                flush=True,
            )
            time.sleep(delay)
    raise RuntimeError('unreachable download retry state')


def _download(case: dict) -> tuple[bytes, str]:
    source = case['source']
    provider = source['provider']
    headers = {'User-Agent': USER_AGENT}

    if provider == 'py-pdf/sample-files':
        repository = source['repository']
        commit = source['commit']
        path = '/'.join(urllib.parse.quote(part, safe='') for part in source['path'].split('/'))
        url = f'https://raw.githubusercontent.com/{repository}/{commit}/{path}'
    elif provider == 'Wikimedia Commons':
        if source.get('url'):
            url = str(source['url'])
        else:
            filename = urllib.parse.quote(source['commons_filename'], safe='')
            url = f'https://commons.wikimedia.org/wiki/Special:Redirect/file/{filename}'
        time.sleep(1.0)
    else:
        raise ValueError(f"Unsupported source provider: {provider}")

    print(f"FETCH {case['id']} {url}", flush=True)
    return _read_url(url, headers)


def _validate_source(case: dict, data: bytes) -> PdfReader:
    source = case['source']
    if not data.startswith(b'%PDF-'):
        raise ValueError(f"{case['id']}: source is not a PDF")

    actual_sha256 = hashlib.sha256(data).hexdigest()
    if actual_sha256 != source['sha256']:
        raise ValueError(
            f"{case['id']}: SHA-256 mismatch: {actual_sha256} != {source['sha256']}"
        )

    reader = PdfReader(io.BytesIO(data))
    actual_pages = len(reader.pages)
    if actual_pages != int(source['pages']):
        raise ValueError(
            f"{case['id']}: source page count mismatch: {actual_pages} != {source['pages']}"
        )
    return reader


def _materialize(case: dict, data: bytes, reader: PdfReader, destination: Path) -> dict:
    source_pages = len(reader.pages)
    selected_pages = [int(page) for page in case.get('selected_pages') or range(1, source_pages + 1)]
    if not selected_pages:
        raise ValueError(f"{case['id']}: selected_pages cannot be empty")
    if selected_pages != sorted(set(selected_pages)):
        raise ValueError(f"{case['id']}: selected_pages must be sorted and unique")
    if selected_pages[0] < 1 or selected_pages[-1] > source_pages:
        raise ValueError(f"{case['id']}: selected_pages outside source page range")

    full_selection = selected_pages == list(range(1, source_pages + 1))
    if full_selection:
        output = data
    else:
        writer = PdfWriter()
        for page_number in selected_pages:
            writer.add_page(reader.pages[page_number - 1])
        buffer = io.BytesIO()
        writer.write(buffer)
        output = buffer.getvalue()

    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(output)
    output_reader = PdfReader(io.BytesIO(output))
    if len(output_reader.pages) != len(selected_pages):
        raise ValueError(f"{case['id']}: derived page count mismatch")

    return {
        'id': case['id'],
        'target': case['target'],
        'filename': case['filename'],
        'source_pages': source_pages,
        'selected_pages': selected_pages,
        'output_pages': len(selected_pages),
        'source_bytes': len(data),
        'output_bytes': len(output),
        'source_sha256': hashlib.sha256(data).hexdigest(),
        'output_sha256': hashlib.sha256(output).hexdigest(),
    }


def main() -> None:
    parser = argparse.ArgumentParser(
        description='Fetch and verify the pinned public real-world PDF-to-Office diagnostic corpus.'
    )
    parser.add_argument(
        '--manifest',
        type=Path,
        default=Path('benchmarks/corpora/pdf_to_office_real_diagnostic_v1.json'),
    )
    parser.add_argument('--case-id', help='Materialize only one manifest case; useful for isolated CI jobs.')
    parser.add_argument('--output-dir', type=Path, required=True)
    parser.add_argument('--output-inventory', type=Path)
    args = parser.parse_args()

    manifest = json.loads(args.manifest.read_text(encoding='utf-8'))
    all_cases = manifest['cases']
    if len(all_cases) != 9:
        raise ValueError(f'Expected 9 diagnostic cases, got {len(all_cases)}')

    if args.case_id:
        cases = [case for case in all_cases if case['id'] == args.case_id]
        if len(cases) != 1:
            raise ValueError(f'Unknown or duplicate case id: {args.case_id}')
    else:
        cases = all_cases

    inventory = []
    for case in cases:
        data, resolved_url = _download(case)
        reader = _validate_source(case, data)
        item = _materialize(case, data, reader, args.output_dir / case['filename'])
        item.update({
            'category': case['category'],
            'title': case['title'],
            'provider': case['source']['provider'],
            'license': case['source']['license'],
            'resolved_url': resolved_url,
        })
        inventory.append(item)
        print(
            f"{case['id']}: source={item['source_pages']} pages -> "
            f"diagnostic={item['output_pages']} pages output_sha256={item['output_sha256']}",
            flush=True,
        )

    if not args.case_id and sum(item['output_pages'] for item in inventory) != 50:
        raise ValueError('Diagnostic corpus must materialize exactly 50 pages')

    if args.output_inventory:
        args.output_inventory.parent.mkdir(parents=True, exist_ok=True)
        args.output_inventory.write_text(
            json.dumps(
                {
                    'manifest_version': manifest['version'],
                    'corpus_kind': manifest['corpus_kind'],
                    'cases': inventory,
                },
                ensure_ascii=False,
                indent=2,
            ) + '\n',
            encoding='utf-8',
        )


if __name__ == '__main__':
    main()
