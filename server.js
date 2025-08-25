const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs").promises; // Use promises for cleaner async/await
const os = require("os");
const { exec } = require("child_process");
const util = require("util");
const admin = require("firebase-admin");

const execAsync = util.promisify(exec);

// Initialize Firebase Admin SDK (make sure serviceAccountKey.json is present)
try {
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
    });
  }
} catch (e) {
  console.warn("Firebase Admin SDK not initialized:", e.message);
}

// Helper function to safely clean up temp directory with retry logic
const cleanupTempDir = async (tempDirPath, delay = 1000) => {
  if (
    !(await fs
      .access(tempDirPath)
      .then(() => true)
      .catch(() => false))
  )
    return;

  const cleanup = async () => {
    try {
      await fs.rm(tempDirPath, { recursive: true, force: true });
      console.log("Temp directory cleaned up successfully.");
    } catch (error) {
      if (error.code === "EBUSY" || error.code === "ENOTEMPTY") {
        console.warn("Files still in use, retrying cleanup in 5 seconds...");
        setTimeout(async () => {
          try {
            await fs.rm(tempDirPath, { recursive: true, force: true });
            console.log("Temp directory cleaned up successfully on retry");
          } catch (retryError) {
            console.warn("Final cleanup attempt failed:", retryError.message);
          }
        }, 5000);
      } else {
        console.warn("Error cleaning up temp directory:", error.message);
      }
    }
  };

  if (delay > 0) {
    setTimeout(cleanup, delay);
  } else {
    await cleanup();
  }
};

const app = express();

// Serve APK file directly from uploads folder at /release.apk
app.use(
  "/release.apk",
  express.static(path.join(__dirname, "uploads", "release.apk"))
);

const PORT = process.env.PORT || 5000;

// Middleware
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "*", // Set FRONTEND_URL in Render.com dashboard
    credentials: true,
  })
);
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Root endpoint with API information
app.get("/", (req, res) => {
  res.json({
    message: "🚀 Web2Appify Express Backend API",
    status: "Server is running",
    platform: "Render",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
    endpoints: {
      health: "/api/health",
      debug: "/api/debug",
      testApk: "/api/test-apk",
      downloadApk: "POST /api/download-apk",
      getOriginalApk: "GET /api/get-original-apk",
    },
    description: "Backend service for APK processing and modification",
    github: "https://github.com/Hemanthreddy747/web2appify-express-backend",
  });
});

// Secure APK download endpoint for browser redirect
app.get("/api/download-apk", async (req, res) => {
  console.log("📱 Secure APK download request received (GET)");
  try {
    // Parse query params for config and idToken
    const {
      url,
      "app-name": appName,
      "owner-name": ownerName,
      "contact-email": contactEmail,
      "phone-number": phoneNumber,
      idToken,
    } = req.query;
    if (!idToken) {
      return res.status(401).json({ error: "Missing authentication token" });
    }
    let decodedToken;
    try {
      decodedToken = await admin.auth().verifyIdToken(idToken);
    } catch (err) {
      return res.status(401).json({ error: "Invalid or expired token" });
    }
    console.log("🔒 Authenticated download for UID:", decodedToken.uid);
    // Optionally, log config params
    console.log("Config for download:", {
      url,
      appName,
      ownerName,
      contactEmail,
      phoneNumber,
    });
    // Serve APK file for download
    const originalApkPath = path.join(__dirname, "uploads", "release.apk");
    if (
      !(await fs
        .access(originalApkPath)
        .then(() => true)
        .catch(() => false))
    ) {
      return res.status(404).json({ error: "Original APK file not found" });
    }
    res.setHeader("Content-Disposition", 'attachment; filename="release.apk"');
    res.setHeader("Content-Type", "application/vnd.android.package-archive");
    const fileStream = (await import("fs")).createReadStream(originalApkPath);
    fileStream.pipe(res);
    fileStream.on("error", (err) => {
      console.error("Error streaming APK file:", err);
      res.status(500).json({ error: "Error downloading APK file" });
    });
    fileStream.on("end", () => {
      console.log("✅ APK download completed for UID:", decodedToken.uid);
    });
  } catch (error) {
    console.error("❌ APK download error:", error);
    res.status(500).json({
      error: "APK download failed",
      details: error.message,
    });
  }
});

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({
    status: "Server is running",
    platform: "Render",
    timestamp: new Date().toISOString(),
    nodeVersion: process.version,
    environment: process.env.NODE_ENV || "development",
  });
});

// Debug endpoint to check file system and Java
app.get("/api/debug", async (req, res) => {
  try {
    const debugInfo = {
      currentDir: __dirname,
      tempDir: "/tmp",
      filesInApp: [],
      filesInUploads: [],
      filesInTools: [],
      javaVersion: null,
      tempDirExists: await fs
        .access("/tmp")
        .then(() => true)
        .catch(() => false),
      uploadsExists: await fs
        .access(path.join(__dirname, "Uploads"))
        .then(() => true)
        .catch(() => false),
      toolsExists: await fs
        .access(path.join(__dirname, "tools"))
        .then(() => true)
        .catch(() => false),
    };

    debugInfo.filesInApp = await fs
      .readdir(__dirname)
      .catch((err) => `Error: ${err.message}`);
    debugInfo.filesInUploads = await fs
      .readdir(path.join(__dirname, "Uploads"))
      .catch((err) => `Error: ${err.message}`);
    debugInfo.filesInTools = await fs
      .readdir(path.join(__dirname, "tools"))
      .catch((err) => `Error: ${err.message}`);

    try {
      const { stdout, stderr } = await execAsync("java -version");
      debugInfo.javaVersion = stderr || stdout;
    } catch (error) {
      debugInfo.javaVersion = `Error: ${error.message}`;
    }

    res.json(debugInfo);
  } catch (error) {
    res.status(500).json({
      error: "Debug endpoint failed",
      details: error.message,
    });
  }
});

// Test APK endpoint
app.get("/api/test-apk", async (req, res) => {
  try {
    const originalApkPath = path.join(__dirname, "uploads", "release.apk");

    const result = {
      apkPath: originalApkPath,
      exists: await fs
        .access(originalApkPath)
        .then(() => true)
        .catch(() => false),
      size: null,
      uploadsDir: path.join(__dirname, "uploads"),
      uploadsDirExists: await fs
        .access(path.join(__dirname, "uploads"))
        .then(() => true)
        .catch(() => false),
      filesInUploads: [],
    };

    if (result.exists) {
      result.size = (await fs.stat(originalApkPath)).size;
    }

    if (result.uploadsDirExists) {
      result.filesInUploads = await fs.readdir(path.join(__dirname, "uploads"));
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({
      error: "Test APK endpoint failed",
      details: error.message,
      stack: error.stack,
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
