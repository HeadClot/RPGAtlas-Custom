$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$imgRoot = Join-Path $root "img"
$types = @("characters", "facesets", "enemies", "tilesets")
$extensions = @(".png", ".webp", ".jpg", ".jpeg")
$manifest = [ordered]@{}

foreach ($type in $types) {
    $folder = Join-Path $imgRoot $type
    $manifest[$type] = @(
        Get-ChildItem -LiteralPath $folder -File -ErrorAction SilentlyContinue |
            Where-Object { $extensions -contains $_.Extension.ToLowerInvariant() } |
            Sort-Object Name |
            ForEach-Object { $_.Name }
    )
}

$manifest | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath (Join-Path $imgRoot "assets.json") -Encoding UTF8
Write-Host "Updated $imgRoot\assets.json"
