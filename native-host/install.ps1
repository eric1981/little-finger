# PowerShell script to install Little Finger Native Host on Windows
# Run as Administrator (for registry write)

$HostBat = "\\wsl$\Ubuntu-24.04\home\eric\little-finger\native-host\little-finger-host.bat"
$ManifestDir = "$env:LOCALAPPDATA\LittleFinger"
$ManifestFile = "$ManifestDir\com.littlefinger.json"

mkdir -Force $ManifestDir | Out-Null

@"
{
  "name": "com.littlefinger",
  "description": "Little Finger Browser Automation",
  "path": "$($HostBat -replace '\\', '\\')",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://*"
  ]
}
"@ | Out-File -Encoding UTF8 $ManifestFile

# Register via Registry
$RegPath = "HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.littlefinger"
New-Item -Path $RegPath -Force | Out-Null
Set-ItemProperty -Path $RegPath -Name "(Default)" -Value $ManifestFile

Write-Host "✅ Little Finger Native Host installed (Windows)"
Write-Host "   Manifest: $ManifestFile"
Write-Host "   Registry: $RegPath"
Write-Host ""
Write-Host "Reload the Chrome extension after installation."
