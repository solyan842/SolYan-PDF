$ErrorActionPreference='Stop'
$stoolWorkRoot=$PSScriptRoot
$env:CARGO_HOME=Join-Path $stoolWorkRoot 'tooling/native-build/cargo'
$env:RUSTUP_HOME=Join-Path $stoolWorkRoot 'tooling/native-build/rustup'
$env:PYTHONPATH=(Join-Path $stoolWorkRoot 'stool-python-tests')+[IO.Path]::PathSeparator+(Join-Path $stoolWorkRoot 'SolYan-PDF')
$env:PYTHONDONTWRITEBYTECODE='1'
$qpdf=Get-ChildItem (Join-Path $stoolWorkRoot 'stool-local-runtime/qpdf') -Recurse -File -Filter qpdf.exe | Select-Object -First 1
if(-not $qpdf){throw 'Verified qpdf runtime not staged'}
$env:PATH=(Join-Path $env:CARGO_HOME 'bin')+[IO.Path]::PathSeparator+$qpdf.DirectoryName+[IO.Path]::PathSeparator+$env:PATH
$stoolPython='C:\Users\Admin\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
