const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs").promises; // Use promises for cleaner async/await
const os = require("os");
const { exec } = require("child_process");
const util = require("util");

const execAsync = util.promisify(exec);

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
    },
    description: "Backend service for APK processing and modification",
    github: "https://github.com/Hemanthreddy747/web2appify-express-backend",
  });
});

// APK download endpoint
app.post("/api/download-apk", async (req, res) => {
  console.log("📱 APK download request received");
  let tempDir; // Declare tempDir here for cleanup in case of errors

  try {
    // Validate payload
    const newConfig = req.body;
    if (!newConfig || Object.keys(newConfig).length === 0) {
      throw new Error("No configuration data provided in request body");
    }
    console.log("📋 Config received:", JSON.stringify(newConfig, null, 2));

    // Path to original APK file
    const originalApkPath = path.join(__dirname, "uploads", "release.apk");
    console.log("📂 Looking for APK at:", originalApkPath);

    // Check if original APK exists
    if (
      !(await fs
        .access(originalApkPath)
        .then(() => true)
        .catch(() => false))
    ) {
      console.error("❌ Original APK file not found at:", originalApkPath);

      // List what's in the uploads directory for debugging
      try {
        const uploadsDir = path.join(__dirname, "uploads");
        const files = (await fs
          .access(uploadsDir)
          .then(() => true)
          .catch(() => false))
          ? await fs.readdir(uploadsDir)
          : [];
        console.log("📁 Files in uploads directory:", files);
      } catch (err) {
        console.error("❌ Error reading uploads directory:", err.message);
      }

      return res.status(404).json({
        error: "Original APK file not found",
        expectedPath: originalApkPath,
        suggestion: "Make sure release.apk exists in the uploads directory",
      });
    }

    console.log(
      "✅ APK file found, size:",
      (await fs.stat(originalApkPath)).size,
      "bytes"
    );

    // Create temporary directories
    tempDir = path.join(
      "/tmp",
      `apk-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    );
    const decompileDir = path.join(tempDir, "decompiled");
    const modifiedApkPath = path.join(tempDir, "modified_release.apk");
    const signedApkPath = path.join(tempDir, "signed_modified_release.apk");

    console.log("📁 Created temp directory:", tempDir);

    // Clean temp directory if exists
    if (
      await fs
        .access(tempDir)
        .then(() => true)
        .catch(() => false)
    ) {
      await cleanupTempDir(tempDir, 0);
    }
    await fs.mkdir(tempDir, { recursive: true });

    console.log("🚀 Starting APK modification process...");

    // Verify Java and apktool
    console.log("☕ Verifying Java installation...");
    try {
      const { stdout: javaVersion } = await execAsync("java -version", {
        timeout: 10000,
      });
      console.log("Java version:", javaVersion);
    } catch (error) {
      throw new Error(
        "Java is not installed or not in PATH. Please install Java 8 or higher."
      );
    }

    console.log("Verifying apktool...");
    const apktoolJarPath = path.join(__dirname, "tools", "apktool.jar");
    if (
      !(await fs
        .access(apktoolJarPath)
        .then(() => true)
        .catch(() => false))
    ) {
      throw new Error(
        "apktool.jar not found. Please run setup-apk-tools.sh or upload manually."
      );
    }

    // Step 1: Decompile APK using apktool
    console.log("Decompiling APK...");
    const decompileCommand = `java -jar "${apktoolJarPath}" d "${originalApkPath}" -o "${decompileDir}" --force-all`;
    console.log(`Running command: ${decompileCommand}`);

    try {
      const { stdout, stderr } = await execAsync(decompileCommand, {
        timeout: 300000,
        maxBuffer: 1024 * 1024 * 10,
        shell: true,
      });

      if (stderr) console.log("apktool stderr:", stderr);
      if (stdout) console.log("apktool stdout:", stdout);
      console.log("APK decompilation completed successfully");
    } catch (error) {
      console.error("Decompilation failed:", error);
      if (error.killed) {
        throw new Error("APK decompilation timed out after 5 minutes");
      }
      throw new Error(`APK decompilation failed: ${error.message}`);
    }

    // Step 2: Find and modify config.json
    console.log("Looking for config.json...");
    const configPath = path.join(
      decompileDir,
      "assets",
      "flutter_assets",
      "assets",
      "config.json"
    );

    if (
      !(await fs
        .access(configPath)
        .then(() => true)
        .catch(() => false))
    ) {
      await cleanupTempDir(tempDir, 0);
      throw new Error(
        "config.json not found in APK at expected location: assets/flutter_assets/assets/config.json"
      );
    }

    console.log(`Found config.json at: ${configPath}`);

    // Read and modify config.json
    try {
      const configContent = JSON.parse(await fs.readFile(configPath, "utf8"));
      console.log("Original config.json content:", configContent);

      await fs.writeFile(configPath, JSON.stringify(newConfig, null, 2));

      const updatedContent = JSON.parse(await fs.readFile(configPath, "utf8"));
      console.log("Updated config.json content:", updatedContent);
      console.log("Config.json replaced with new payload data");
    } catch (jsonError) {
      await cleanupTempDir(tempDir, 0);
      throw new Error(
        `Failed to read or modify config.json: ${jsonError.message}`
      );
    }

    // Step 3: Recompile APK
    console.log("Recompiling APK...");
    const recompileCommand = `java -jar "${apktoolJarPath}" b "${decompileDir}" -o "${modifiedApkPath}" --force-all`;
    console.log(`Running command: ${recompileCommand}`);

    try {
      const { stdout, stderr } = await execAsync(recompileCommand, {
        timeout: 300000,
        maxBuffer: 1024 * 1024 * 10,
        shell: true,
      });

      if (stderr) console.log("apktool recompile stderr:", stderr);
      if (stdout) console.log("apktool recompile stdout:", stdout);
      console.log("APK recompilation completed successfully");
    } catch (error) {
      console.error("Recompilation failed:", error);
      if (error.killed) {
        throw new Error("APK recompilation timed out after 5 minutes");
      }
      throw new Error(`APK recompilation failed: ${error.message}`);
    }

    // Step 4: Sign the APK using uber-apk-signer
    console.log("Signing APK...");
    const uberSignerPath = path.join(__dirname, "tools", "uber-apk-signer.jar");

    if (
      !(await fs
        .access(uberSignerPath)
        .then(() => true)
        .catch(() => false))
    ) {
      throw new Error(
        "uber-apk-signer.jar not found. Please run setup-uber-signer.sh or upload manually."
      );
    }

    const signCommand = `java -jar "${uberSignerPath}" --apks "${modifiedApkPath}" --out "${path.dirname(
      signedApkPath
    )}" --allowResign --verbose`;
    console.log(`Running command: ${signCommand}`);

    try {
      const { stdout, stderr } = await execAsync(signCommand, {
        timeout: 300000,
        maxBuffer: 1024 * 1024 * 10,
        shell: true,
      });

      if (stderr) console.log("uber-apk-signer stderr:", stderr);
      if (stdout) console.log("uber-apk-signer stdout:", stdout);

      const actualSignedApkPath = path.join(
        tempDir,
        "modified_release-aligned-debugSigned.apk"
      );

      if (
        !(await fs
          .access(actualSignedApkPath)
          .then(() => true)
          .catch(() => false))
      ) {
        const tempFiles = await fs.readdir(tempDir);
        console.log("Files in temp directory:", tempFiles);
        throw new Error("Signed APK was not created successfully");
      }

      await fs.rename(actualSignedApkPath, signedApkPath);
      console.log("APK signing completed successfully");
    } catch (error) {
      console.error("APK signing failed:", error);
      if (error.killed) {
        throw new Error("APK signing timed out after 5 minutes");
      }
      throw new Error(`APK signing failed: ${error.message}`);
    }

    console.log("APK modification and signing completed successfully");

    // Step 5: Send the signed APK
    const stat = await fs.stat(signedApkPath);
    const fileSize = stat.size;

    res.setHeader("Content-Type", "application/vnd.android.package-archive");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="signed_modified_release.apk"'
    );
    res.setHeader("Content-Length", fileSize);

    const fileStream = (await import("fs")).createReadStream(signedApkPath);
    fileStream.pipe(res);

    fileStream.on("error", (err) => {
      console.error("Error streaming signed file:", err);
      res.status(500).json({ error: "Error downloading signed file" });
    });

    fileStream.on("end", () => {
      cleanupTempDir(tempDir, 5000);
    });

    console.log("✅ Signed APK download initiated successfully");
  } catch (error) {
    console.error("❌ APK modification error:", error);
    console.error("❌ Error stack:", error.stack);

    if (tempDir) {
      await cleanupTempDir(tempDir, 2000);
    }

    if (error.message.includes("config.json not found")) {
      res.status(404).json({
        error: "Configuration file not found in APK",
        details: error.message,
      });
    } else if (error.message.includes("Failed to read or modify config.json")) {
      res.status(400).json({
        error: "Invalid configuration file format",
        details: error.message,
      });
    } else if (error.message.includes("uber-apk-signer.jar not found")) {
      res.status(500).json({
        error: "APK signing tool not found",
        details: error.message,
      });
    } else if (error.message.includes("APK signing failed")) {
      res.status(500).json({
        error: "APK signing failed",
        details: error.message,
      });
    } else {
      res.status(500).json({
        error: "APK modification failed",
        details: error.message,
        stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
        timestamp: new Date().toISOString(),
      });
    }
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
        .access(path.join(__dirname, "uploads"))
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
      .readdir(path.join(__dirname, "uploads"))
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
    const originalApkPath = path.join(__dirname, "Uploads", "release.apk");

    const result = {
      apkPath: originalApkPath,
      exists: await fs
        .access(originalApkPath)
        .then(() => true)
        .catch(() => false),
      size: null,
      uploadsDir: path.join(__dirname, "Uploads"),
      uploadsDirExists: await fs
        .access(path.join(__dirname, "Uploads"))
        .then(() => true)
        .catch(() => false),
      filesInUploads: [],
    };

    if (result.exists) {
      result.size = (await fs.stat(originalApkPath)).size;
    }

    if (result.uploadsDirExists) {
      result.filesInUploads = await fs.readdir(path.join(__dirname, "Uploads"));
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
