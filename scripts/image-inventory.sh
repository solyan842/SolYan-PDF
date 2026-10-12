#!/bin/sh
set -eu

printf '%s\n' '# SolYan PDF container package inventory'
printf 'generated_utc=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
printf 'hostname=%s\n' "$(hostname 2>/dev/null || true)"

printf '\n%s\n' '## /etc/os-release'
cat /etc/os-release 2>/dev/null || true

if command -v dpkg-query >/dev/null 2>&1; then
  printf '\n%s\n' '## dpkg packages'
  dpkg-query -W -f='${binary:Package}\t${Version}\n' | LC_ALL=C sort
fi

if command -v apk >/dev/null 2>&1; then
  printf '\n%s\n' '## apk packages'
  apk info -v | LC_ALL=C sort
fi

if command -v python >/dev/null 2>&1; then
  printf '\n%s\n' '## Python'
  python --version 2>&1 || true
  printf '\n%s\n' '## pip freeze --all'
  python -m pip freeze --all 2>/dev/null | LC_ALL=C sort || true
fi

if command -v node >/dev/null 2>&1; then
  printf '\n%s\n' '## Node.js'
  node --version 2>&1 || true
  npm --version 2>&1 || true
  printf '\n%s\n' '## npm production dependency tree'
  npm ls --omit=dev --all --json 2>/dev/null || true
fi

for binary in qpdf tesseract libreoffice; do
  if command -v "$binary" >/dev/null 2>&1; then
    printf '\n## %s version\n' "$binary"
    case "$binary" in
      qpdf) qpdf --version 2>&1 || true ;;
      tesseract) tesseract --version 2>&1 || true ;;
      libreoffice) libreoffice --version 2>&1 || true ;;
    esac
  fi
done
