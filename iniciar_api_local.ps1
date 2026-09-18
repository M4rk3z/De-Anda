$ErrorActionPreference = 'Stop'

$apiDir = Join-Path $PSScriptRoot 'local-api'
$configPath = Join-Path $apiDir 'config.json'

if (!(Test-Path $configPath)) {
  throw "No existe local-api\config.json. Ejecuta primero instalar_api_local.ps1."
}

Push-Location $apiDir
try {
  npm start
}
finally {
  Pop-Location
}
