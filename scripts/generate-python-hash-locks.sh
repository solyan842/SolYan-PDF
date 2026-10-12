#!/usr/bin/env bash
set -euo pipefail

PYTHON_BIN="${PYTHON_BIN:-python3}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PIP_VERSION="26.2.1"
PIP_TOOLS_VERSION="7.5.1"
SERVICES=(
  backend
  engines/office-service
  engines/sign-service
  engines/archive-service
)

version="$(${PYTHON_BIN} -c 'import sys; print(".".join(map(str, sys.version_info[:3])))')"
if [[ "$version" != "3.13.16" ]]; then
  echo "Expected Python 3.13.16 for hash-lock generation; got ${version}. Set PYTHON_BIN to the exact interpreter." >&2
  exit 2
fi

venv_dir="$(mktemp -d -t solyan-python-hash-lock.XXXXXX)"
trap 'rm -rf "$venv_dir"' EXIT

"$PYTHON_BIN" -m venv "$venv_dir/venv"
py="$venv_dir/venv/bin/python"
"$py" -m pip install --disable-pip-version-check "pip==${PIP_VERSION}" "pip-tools==${PIP_TOOLS_VERSION}"
pip_compile="$venv_dir/venv/bin/pip-compile"

for service in "${SERVICES[@]}"; do
  echo "Hash-locking ${service}"
  CUSTOM_COMPILE_COMMAND='PYTHON_BIN=/path/to/python3.13.16 ./scripts/generate-python-hash-locks.sh' \
    "$pip_compile" \
      --generate-hashes \
      --resolver=backtracking \
      --strip-extras \
      --output-file "$ROOT/$service/requirements.hashes" \
      "$ROOT/$service/requirements.txt"
done

echo 'Python hash lockfiles regenerated successfully.'
