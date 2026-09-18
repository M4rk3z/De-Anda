$ErrorActionPreference = "Stop"

$pgDump = "C:\Program Files\PostgreSQL\18\bin\pg_dump.exe"

if (-not (Test-Path -LiteralPath $pgDump)) {
  Write-Host "No se encontro pg_dump en: $pgDump" -ForegroundColor Red
  Write-Host "Instala PostgreSQL o ajusta la ruta de pg_dump dentro de este script."
  exit 1
}

$defaultOutput = Join-Path $env:USERPROFILE "Desktop\de_anda_supabase_$(Get-Date -Format 'yyyyMMdd_HHmmss').dump"

Write-Host ""
Write-Host "Exportar base de datos de Supabase" -ForegroundColor Cyan
Write-Host "Pega el Connection string tipo URI de Supabase."
Write-Host "Ejemplo: postgresql://postgres:TU_PASSWORD@db.xxxxx.supabase.co:5432/postgres"
Write-Host ""

$connectionString = Read-Host "Connection string"

if ([string]::IsNullOrWhiteSpace($connectionString)) {
  Write-Host "No se recibio connection string." -ForegroundColor Red
  exit 1
}

$outputFile = Read-Host "Archivo destino [$defaultOutput]"

if ([string]::IsNullOrWhiteSpace($outputFile)) {
  $outputFile = $defaultOutput
}

Write-Host ""
Write-Host "Generando backup..." -ForegroundColor Yellow

& $pgDump `
  $connectionString `
  --format=custom `
  --no-owner `
  --no-privileges `
  --file="$outputFile"

if ($LASTEXITCODE -ne 0) {
  Write-Host "No se pudo generar el backup." -ForegroundColor Red
  exit $LASTEXITCODE
}

Write-Host ""
Write-Host "Backup creado correctamente:" -ForegroundColor Green
Write-Host $outputFile
