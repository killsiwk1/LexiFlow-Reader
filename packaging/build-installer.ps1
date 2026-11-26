# Run after building the x64 release executable. Makensis must be on PATH.
param(
  [Parameter(Mandatory)][string]$AppDir,
  [Parameter(Mandatory)][string]$WebView2OfflineInstaller,
  [Parameter(Mandatory)][string]$Output
)
$ErrorActionPreference = 'Stop'
$app = (Resolve-Path $AppDir).Path
$runtime = (Resolve-Path $WebView2OfflineInstaller).Path
$outPath = [IO.Path]::GetFullPath($Output)
foreach ($required in 'lexiflow.exe','WebView2Loader.dll') {
  if (!(Test-Path -LiteralPath (Join-Path $app $required))) { throw "Missing $required in $app" }
}
$flags = @("/DOUTPUT=$outPath", "/DAPPDIR=$app", "/DRUNTIME=$runtime")
$i = 0
foreach ($dll in 'WebView2Loader.dll','libunwind.dll','libwinpthread-1.dll','libc++.dll') {
  if (Test-Path -LiteralPath (Join-Path $app $dll)) {
    $flags += "/DRUNTIME_DLL${i}=$dll"; $i++
  }
}
Push-Location $PSScriptRoot
try {
  & makensis /INPUTCHARSET UTF8 @flags windows.nsi
  if ($LASTEXITCODE) { throw "NSIS packaging failed: $LASTEXITCODE" }
} finally { Pop-Location }
