$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$outputDir = Join-Path $root "bin"
$compiler = "$env:WINDIR\Microsoft.NET\Framework64\v4.0.30319\csc.exe"

if (-not (Test-Path -LiteralPath $compiler)) {
    throw "The .NET Framework C# compiler was not found at $compiler."
}

New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
& $compiler /nologo /target:winexe /optimize+ `
    /reference:System.Windows.Forms.dll `
    /out:"$outputDir\RPGAtlasLauncher.exe" `
    "$PSScriptRoot\RPGAtlasLauncher.cs"

if ($LASTEXITCODE -ne 0) {
    throw "RPGAtlasLauncher.exe failed to compile."
}

Write-Host "Built $outputDir\RPGAtlasLauncher.exe"
