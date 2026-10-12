#!/usr/bin/env bash
set -euo pipefail

PYTHON_BIN="${PYTHON_BIN:-python3}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOCK_PIP_VERSION="26.2.1"
PIP_TOOLS_VERSION="7.6.2"
SERVICES=(
  backend
  engines/office-service
  engines/sign-service
  engines/archive-service
)

version="$(${PYTHON_BIN} -c 'import sys; print(".".join(map(str, sys.version_info[:3])))')"
if [[ "$version" != "3.13.16" ]]; then
  echo "Expected Python 3.13.16 for hash-lock generation; got ${version}." >&2
  exit 2
fi

venv_dir="$(mktemp -d -t solyan-python-hash-lock.XXXXXX)"
trap 'rm -rf "$venv_dir"' EXIT
"$PYTHON_BIN" -m venv "$venv_dir/venv"
py="$venv_dir/venv/bin/python"
pip_compile="$venv_dir/venv/bin/pip-compile"
"$py" -m pip install --disable-pip-version-check "pip==${LOCK_PIP_VERSION}" "pip-tools==${PIP_TOOLS_VERSION}"

for service in "${SERVICES[@]}"; do
  input="$ROOT/$service/requirements.lock"
  output="$ROOT/$service/requirements.hashed.lock"
  echo "Hash-locking ${service}"
  "$pip_compile" \
    --generate-hashes \
    --resolver=backtracking \
    --no-header \
    --no-annotate \
    --output-file "$output" \
    "$input"
done

echo 'Hash-verified Python lockfiles generated successfully.'
