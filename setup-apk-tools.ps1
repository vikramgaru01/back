# Setup script for APK tools on Windows

Write-Host "Setting up APK tools for Android APK processing..." -ForegroundColor Green

# Create tools directory
$toolsDir = ".\tools"
if (-not (Test-Path $toolsDir)) {
  New-Item -ItemType Directory -Path $toolsDir
}

# Download and setup apktool
Write-Host "Downloading apktool..." -ForegroundColor Yellow
$apktoolUrl = "https://raw.githubusercontent.com/iBotPeaches/Apktool/master/scripts/windows/apktool.bat"
$apktoolJarUrl = "https://bitbucket.org/iBotPeaches/apktool/downloads/apktool_2.8.1.jar"

try {
  Invoke-WebRequest -Uri $apktoolUrl -OutFile "$toolsDir\apktool.bat"
  Invoke-WebRequest -Uri $apktoolJarUrl -OutFile "$toolsDir\apktool.jar"
    
  # Add tools directory to PATH temporarily
  $env:PATH = "$((Get-Location).Path)\tools;$env:PATH"
    
  Write-Host "APK tools installed successfully!" -ForegroundColor Green
  Write-Host "You may need to install Java if not already installed." -ForegroundColor Yellow
  Write-Host "Tools are available in the 'tools' directory." -ForegroundColor Cyan
    
}
catch {
  Write-Host "Error downloading APK tools: $_" -ForegroundColor Red
}

# Check if Java is installed
try {
  $javaVersion = java -version 2>&1
  Write-Host "Java is installed: $($javaVersion[0])" -ForegroundColor Green
}
catch {
  Write-Host "Java is not installed or not in PATH. Please install Java 8 or higher." -ForegroundColor Red
  Write-Host "Download from: https://www.oracle.com/java/technologies/downloads/" -ForegroundColor Cyan
}
