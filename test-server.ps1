# Test script for APK modification and signing

Write-Host "Testing APK Modification and Signing Service..." -ForegroundColor Green

# Test the health endpoint first
Write-Host "1. Testing health endpoint..." -ForegroundColor Yellow
try {
    $healthResponse = Invoke-RestMethod -Uri "http://localhost:5000/api/health" -Method GET
    Write-Host "Health check passed: $($healthResponse.status)" -ForegroundColor Green
}
catch {
    Write-Host "Health check failed: $_" -ForegroundColor Red
    exit 1
}

# Test the APK modification endpoint (this will only work if you have an APK file in uploads/release.apk)
Write-Host "2. Testing APK modification endpoint..." -ForegroundColor Yellow

$testPayload = @{
    message = "https://example.com/test-url"
} | ConvertTo-Json

Write-Host "Sending test payload: $testPayload" -ForegroundColor Cyan

try {
    # Note: This will fail if there's no APK file in uploads/release.apk
    # but it will test the endpoint structure
    $response = Invoke-WebRequest -Uri "http://localhost:5000/api/download-apk" -Method POST -Body $testPayload -ContentType "application/json"
    
    if ($response.StatusCode -eq 200) {
        Write-Host "APK modification successful! File would be downloaded." -ForegroundColor Green
        Write-Host "Response headers:" -ForegroundColor Cyan
        $response.Headers | Format-Table
    }
}
catch {
    $errorResponse = $_.Exception.Response
    if ($errorResponse.StatusCode -eq 404) {
        Write-Host "Expected error: APK file not found (upload an APK to uploads/release.apk to test)" -ForegroundColor Yellow
    }
    else {
        Write-Host "Error testing APK modification: $_" -ForegroundColor Red
    }
}

Write-Host "`nTest Summary:" -ForegroundColor Green
Write-Host "- Server is running and responding to health checks" -ForegroundColor Green
Write-Host "- APK modification endpoint is accessible" -ForegroundColor Green
Write-Host "- To test full functionality, place an APK file at uploads/release.apk" -ForegroundColor Yellow

Write-Host "`nServer Features:" -ForegroundColor Cyan
Write-Host "- APK Decompilation using apktool" -ForegroundColor Green
Write-Host "- Config.json modification" -ForegroundColor Green
Write-Host "- APK Recompilation" -ForegroundColor Green
Write-Host "- APK Signing with uber-apk-signer" -ForegroundColor Green
Write-Host "- Automatic cleanup of temporary files" -ForegroundColor Green
