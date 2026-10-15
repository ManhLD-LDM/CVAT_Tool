$ErrorActionPreference = 'Stop'
$projectDirectory = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$distDirectory = Join-Path $projectDirectory 'dist'
$packageDirectory = Join-Path $distDirectory 'extension'
New-Item -ItemType Directory -Path $packageDirectory -Force | Out-Null
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
$nodeBin = if ($nodeCmd) { 'node' } elseif (Test-Path "C:\Users\LeManh\AppData\Local\OpenAI\Codex\runtimes\cua_node\cfb32733c877621e\bin\node.exe") { "C:\Users\LeManh\AppData\Local\OpenAI\Codex\runtimes\cua_node\cfb32733c877621e\bin\node.exe" } else { throw 'Node.js not found' }
& $nodeBin (Join-Path $PSScriptRoot 'build-extension.cjs')
if ($LASTEXITCODE -ne 0) { throw 'Extension build failed' }
$manifestVersion = (Get-Content -LiteralPath (Join-Path $projectDirectory 'extension/manifest.json') -Raw | ConvertFrom-Json).version
$packageFiles = @('manifest.json','copilot_main.js','copilot_panel.js','geometry_math.js','cvat_adapter.js','main_world_bridge.js','content_script.js','styles.css','session_transport.js','session_worker.js','session.html','session.css','session.js','batch_math.js','batch_cloud.js','batch_controller.js','batch_ui.js','THIRD_PARTY_LICENSES.txt')
foreach ($packageFile in $packageFiles) {
    Copy-Item -LiteralPath (Join-Path $projectDirectory ('extension/' + $packageFile)) -Destination (Join-Path $packageDirectory $packageFile) -Force
}
$archiveFiles = $packageFiles | ForEach-Object { Join-Path $packageDirectory $_ }
Compress-Archive -LiteralPath $archiveFiles -DestinationPath (Join-Path $distDirectory ('CVAT-3D-Tool-Extension-' + $manifestVersion + '.zip')) -Force
Write-Output ('Packaged extension ' + $manifestVersion + ' (no cached job or credentials).')
