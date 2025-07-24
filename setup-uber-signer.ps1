# PowerShell script to download uber-apk-signer
Write-Host "Setting up uber-apk-signer..." -ForegroundColor Green

# Create tools directory if it doesn't exist
$toolsDir = Join-Path $PSScriptRoot "tools"
if (!(Test-Path $toolsDir)) {
  New-Item -ItemType Directory -Path $toolsDir -Force
  Write-Host "Created tools directory: $toolsDir" -ForegroundColor Yellow
}

# Download uber-apk-signer
$uberSignerUrl = "https://github.com/patrickfav/uber-apk-signer/releases/download/v1.3.0/uber-apk-signer-1.3.0.jar"
$uberSignerPath = Join-Path $toolsDir "uber-apk-signer.jar"

if (!(Test-Path $uberSignerPath)) {
  Write-Host "Downloading uber-apk-signer..." -ForegroundColor Yellow
  try {
    Invoke-WebRequest -Uri $uberSignerUrl -OutFile $uberSignerPath
    Write-Host "Successfully downloaded uber-apk-signer to: $uberSignerPath" -ForegroundColor Green
  }
  catch {
    Write-Host "Failed to download uber-apk-signer: $_" -ForegroundColor Red
    exit 1
  }
}
else {
  Write-Host "uber-apk-signer already exists at: $uberSignerPath" -ForegroundColor Green
}

# Verify Java installation
Write-Host "Verifying Java installation..." -ForegroundColor Yellow
try {
  $javaVersion = java -version 2>&1
  Write-Host "Java is installed: $($javaVersion[0])" -ForegroundColor Green
}
catch {
  Write-Host "Java is not installed or not in PATH. Please install Java 8 or higher." -ForegroundColor Red
  exit 1
}

Write-Host "Setup completed successfully!" -ForegroundColor Green
Write-Host "uber-apk-signer is ready to use." -ForegroundColor Green
