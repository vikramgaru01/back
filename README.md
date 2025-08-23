# APK Processing Server

This server processes Android APK files by decompiling them, modifying configuration files, recompiling them, and signing them for installation.

## Setup

1. **Install Java** (required for APK tools):

   - Download and install Java 8 or higher from [Oracle](https://www.oracle.com/java/technologies/downloads/)

2. **Install APK Tools**:

   ```powershell
   .\setup-apk-tools.ps1
   ```

3. **Install APK Signing Tool**:

   ```powershell
   .\setup-uber-signer.ps1
   ```

4. **Install Node.js dependencies**:
   ```powershell
   npm install
   ```

## Usage
/api/get-original-apk   for getting original apk

The server provides an endpoint `/api/download-apk` that:

1. Receives a POST request with a JSON payload containing a `message` field
2. Decompiles the APK file located at `uploads/release.apk`
3. Finds the `config.json` file within the decompiled APK
4. Replaces the URL in the config.json with the value from the `message` field
5. Recompiles the APK
6. Signs the APK using uber-apk-signer with a debug key (for testing purposes)
7. Returns the signed APK file for download

### Example Request:

```javascript
fetch("/api/download-apk", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    message: "https://your-new-url.com",
  }),
});
```

## File Structure

- `server.js` - Main server file
- `uploads/release.apk` - Original APK file to be processed
- `tools/` - APK processing tools (apktool, uber-apk-signer)
- `temp/` - Temporary directory for APK processing (auto-cleaned)
- `setup-apk-tools.ps1` - Script to download apktool
- `setup-uber-signer.ps1` - Script to download uber-apk-signer

## Requirements

- Node.js
- Java 8 or higher
- APK tools (apktool)
- APK signing tool (uber-apk-signer)
- Original APK file in the `uploads` directory

## Notes

- The server creates temporary directories during processing and cleans them up after sending the file
- The modified APK is automatically signed using uber-apk-signer with a debug key for testing
- For production use, you should use your own keystore for signing
- Make sure the original APK contains a `config.json` file with the expected structure
- The signed APK should be installable on Android devices for testing purposes

## Render.com Deployment Notes

- Render.com uses Linux containers. Ensure all tools (apktool, uber-apk-signer) are `.jar` files and compatible with Linux.
- Set environment variables in Render.com dashboard:
  - `PORT` (Render sets this automatically)
  - `FRONTEND_URL` (your frontend URL)
- Place required files (`release.apk`, tools) in the correct directories before deployment.
- Use environment variables in frontend for API calls (`REACT_APP_API_BASE_URL`).
# back
# back
