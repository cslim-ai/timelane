$ErrorActionPreference = 'Stop'
Invoke-Item -LiteralPath (Join-Path $PSScriptRoot 'index.html')
