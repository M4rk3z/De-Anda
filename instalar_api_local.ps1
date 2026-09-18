$ErrorActionPreference = 'Stop'

$apiDir = Join-Path $PSScriptRoot 'local-api'
$configPath = Join-Path $apiDir 'config.json'
$examplePath = Join-Path $apiDir 'config.example.json'

if (!(Test-Path $apiDir)) {
  throw "No se encontro la carpeta local-api."
}

if (!(Get-Command node -ErrorAction SilentlyContinue)) {
  throw "No se encontro Node.js. Instala Node.js LTS antes de continuar."
}

Push-Location $apiDir
try {
  npm install

  if (!(Test-Path $configPath)) {
    Copy-Item $examplePath $configPath
    Write-Host ""
    Write-Host "Se creo local-api\config.json."
    Write-Host "Abre ese archivo y cambia CAMBIA_ESTA_PASSWORD por la contraseña local de PostgreSQL."
  }
}
finally {
  Pop-Location
}

Write-Host ""
Write-Host "Instalacion terminada."
Write-Host "Cuando config.json tenga la password correcta, inicia el API con:"
Write-Host "powershell -ExecutionPolicy Bypass -File .\iniciar_api_local.ps1"
