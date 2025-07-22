const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { exec } = require("child_process");
const util = require("util");

const execAsync = util.promisify(exec);

// Helper function to safely clean up temp directory with retry logic
const cleanupTempDir = (tempDirPath, delay = 1000) => {
  if (!fs.existsSync(tempDirPath)) return;

  const cleanup = () => {
    try {
      fs.rmSync(tempDirPath, { recursive: true, force: true });
      console.log("Temp directory cleaned up successfully");
    } catch (error) {
      if (error.code === "EBUSY" || error.code === "ENOTEMPTY") {
        console.warn("Files still in use, retrying cleanup in 5 seconds...");
        setTimeout(() => {
          try {
            fs.rmSync(tempDirPath, { recursive: true, force: true });
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
    cleanup();
  }
};

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "*",
    credentials: true,
  })
);
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// APK download endpoint
app.post("/api/download-apk", async (req, res) => {
  console.log("📱 APK download request received");
  
  try {
    // Use whatever payload is received from frontend
    const newConfig = req.body;
    console.log("📋 Config received:", JSON.stringify(newConfig, null, 2));

    // Path to your original APK file
    const originalApkPath = path.join(__dirname, "uploads", "release.apk");
    console.log("📂 Looking for APK at:", originalApkPath);

    // Check if original APK exists
    if (!fs.existsSync(originalApkPath)) {
      console.error("❌ Original APK file not found at:", originalApkPath);
      
      // List what's actually in the uploads directory for debugging
      try {
        const uploadsDir = path.join(__dirname, "uploads");
        const files = fs.existsSync(uploadsDir) ? fs.readdirSync(uploadsDir) : [];
        console.log("📁 Files in uploads directory:", files);
      } catch (err) {
        console.error("❌ Error reading uploads directory:", err.message);
      }
      
      return res.status(404).json({ 
        error: "Original APK file not found",
        expectedPath: originalApkPath,
        suggestion: "Make sure release.apk exists in the uploads directory"
      });
    }

    console.log("✅ APK file found, size:", fs.statSync(originalApkPath).size, "bytes");

    // Create temporary directories (use /tmp for Render compatibility)
    const tempDir = path.join(
      "/tmp",
      `apk-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    );
    const decompileDir = path.join(tempDir, "decompiled");
    const modifiedApkPath = path.join(tempDir, "modified_release.apk");
    const signedApkPath = path.join(tempDir, "signed_modified_release.apk");

    console.log("📁 Created temp directory:", tempDir);

    // Clean temp directory if exists
    if (fs.existsSync(tempDir)) {
      cleanupTempDir(tempDir, 0); // No delay for initial cleanup
    }
    fs.mkdirSync(tempDir, { recursive: true });

    console.log("🚀 Starting APK modification process...");

    // Verify Java and apktool are available
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
    const apktoolPath = path.join(__dirname, "tools", "apktool.bat");
    const apktoolJarPath = path.join(__dirname, "tools", "apktool.jar");
    if (!fs.existsSync(apktoolPath)) {
      throw new Error(
        "apktool.bat not found. Please run setup-apk-tools.ps1 first."
      );
    }
    if (!fs.existsSync(apktoolJarPath)) {
      throw new Error(
        "apktool.jar not found. Please run setup-apk-tools.ps1 first."
      );
    }

    // Step 1: Decompile APK using apktool
    console.log("Decompiling APK...");

    // Add timeout and better error handling
    // Use Java JAR directly to avoid Windows batch file prompt issues
    const decompileCommand = `java -jar "${apktoolJarPath}" d "${originalApkPath}" -o "${decompileDir}" --force-all`;
    console.log(`Running command: ${decompileCommand}`);

    try {
      const { stdout, stderr } = await execAsync(decompileCommand, {
        timeout: 300000, // 5 minute timeout
        maxBuffer: 1024 * 1024 * 10, // 10MB buffer
        shell: true,
      });

      if (stderr) {
        console.log("apktool stderr:", stderr);
      }
      if (stdout) {
        console.log("apktool stdout:", stdout);
      }

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

    if (!fs.existsSync(configPath)) {
      // Clean up temp directory before throwing error
      cleanupTempDir(tempDir, 0);
      throw new Error(
        "config.json not found in APK at expected location: assets/flutter_assets/assets/config.json"
      );
    }

    console.log(`Found config.json at: ${configPath}`);

    // Read and modify config.json
    try {
      const configContent = JSON.parse(fs.readFileSync(configPath, "utf8"));
      console.log("Original config.json content:", configContent);

      // Replace entire config with new data from frontend
      fs.writeFileSync(configPath, JSON.stringify(newConfig, null, 2));

      // Verify the file was updated
      const updatedContent = JSON.parse(fs.readFileSync(configPath, "utf8"));
      console.log("Updated config.json content:", updatedContent);
      console.log("Config.json replaced with new payload data");
    } catch (jsonError) {
      // Clean up temp directory before throwing error
      cleanupTempDir(tempDir, 0);
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
        timeout: 300000, // 5 minute timeout
        maxBuffer: 1024 * 1024 * 10, // 10MB buffer
        shell: true,
      });

      if (stderr) {
        console.log("apktool recompile stderr:", stderr);
      }
      if (stdout) {
        console.log("apktool recompile stdout:", stdout);
      }

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

    // Check if uber-apk-signer exists
    if (!fs.existsSync(uberSignerPath)) {
      throw new Error(
        "uber-apk-signer.jar not found. Please run setup-uber-signer.ps1 first."
      );
    }

    // Sign the APK using uber-apk-signer with default key
    // Note: Cannot use both --out and --overwrite together
    const signCommand = `java -jar "${uberSignerPath}" --apks "${modifiedApkPath}" --out "${path.dirname(
      signedApkPath
    )}" --allowResign --verbose`;
    console.log(`Running command: ${signCommand}`);

    try {
      const { stdout, stderr } = await execAsync(signCommand, {
        timeout: 300000, // 5 minute timeout
        maxBuffer: 1024 * 1024 * 10, // 10MB buffer
        shell: true,
      });

      if (stderr) {
        console.log("uber-apk-signer stderr:", stderr);
      }
      if (stdout) {
        console.log("uber-apk-signer stdout:", stdout);
      }

      // uber-apk-signer creates a file with -aligned-debugSigned suffix
      const actualSignedApkPath = path.join(
        tempDir,
        "modified_release-aligned-debugSigned.apk"
      );

      // Check if the signed APK was created
      if (!fs.existsSync(actualSignedApkPath)) {
        // List all files in temp directory for debugging
        const tempFiles = fs.readdirSync(tempDir);
        console.log("Files in temp directory:", tempFiles);
        throw new Error("Signed APK was not created successfully");
      }

      // Rename to our expected path for consistency
      fs.renameSync(actualSignedApkPath, signedApkPath);

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
    const stat = fs.statSync(signedApkPath);
    const fileSize = stat.size;

    res.setHeader("Content-Type", "application/vnd.android.package-archive");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="signed_modified_release.apk"'
    );
    res.setHeader("Content-Length", fileSize);

    const fileStream = fs.createReadStream(signedApkPath);
    fileStream.pipe(res);

    fileStream.on("error", (err) => {
      console.error("Error streaming signed file:", err);
      res.status(500).json({ error: "Error downloading signed file" });
    });

    fileStream.on("end", () => {
      // Clean up temp files after download with delay to handle file locks
      cleanupTempDir(tempDir, 5000); // 5 second delay
    });

    console.log("✅ Signed APK download initiated successfully");
  } catch (error) {
    console.error("❌ APK modification error:", error);
    console.error("❌ Error stack:", error.stack);

    // Clean up temp directory in case of error
    if (typeof tempDir !== 'undefined') {
      cleanupTempDir(tempDir, 2000); // 2 second delay
    }

    // Send appropriate error message based on error type
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
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
        timestamp: new Date().toISOString()
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
    environment: process.env.NODE_ENV || "development"
  });
});

// Debug endpoint to check file system and Java
app.get("/api/debug", (req, res) => {
  try {
    const debugInfo = {
      currentDir: __dirname,
      tempDir: "/tmp",
      filesInApp: [],
      filesInUploads: [],
      filesInTools: [],
      javaVersion: null,
      tempDirExists: fs.existsSync("/tmp"),
      uploadsExists: fs.existsSync(path.join(__dirname, "uploads")),
      toolsExists: fs.existsSync(path.join(__dirname, "tools"))
    };

    // List files in current directory
    try {
      debugInfo.filesInApp = fs.readdirSync(__dirname);
    } catch (err) {
      debugInfo.filesInApp = `Error: ${err.message}`;
    }

    // List files in uploads
    try {
      const uploadsPath = path.join(__dirname, "uploads");
      if (fs.existsSync(uploadsPath)) {
        debugInfo.filesInUploads = fs.readdirSync(uploadsPath);
      }
    } catch (err) {
      debugInfo.filesInUploads = `Error: ${err.message}`;
    }

    // List files in tools
    try {
      const toolsPath = path.join(__dirname, "tools");
      if (fs.existsSync(toolsPath)) {
        debugInfo.filesInTools = fs.readdirSync(toolsPath);
      }
    } catch (err) {
      debugInfo.filesInTools = `Error: ${err.message}`;
    }

    // Check Java version
    exec("java -version", (error, stdout, stderr) => {
      if (error) {
        debugInfo.javaVersion = `Error: ${error.message}`;
      } else {
        debugInfo.javaVersion = stderr || stdout;
      }
      res.json(debugInfo);
    });

  } catch (error) {
    res.status(500).json({
      error: "Debug endpoint failed",
      details: error.message
    });
  }
});

// Simple test endpoint to check APK file access
app.get("/api/test-apk", (req, res) => {
  try {
    const originalApkPath = path.join(__dirname, "uploads", "release.apk");
    
    const result = {
      apkPath: originalApkPath,
      exists: fs.existsSync(originalApkPath),
      size: null,
      uploadsDir: path.join(__dirname, "uploads"),
      uploadsDirExists: fs.existsSync(path.join(__dirname, "uploads")),
      filesInUploads: []
    };

    if (result.exists) {
      result.size = fs.statSync(originalApkPath).size;
    }

    if (result.uploadsDirExists) {
      result.filesInUploads = fs.readdirSync(path.join(__dirname, "uploads"));
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({
      error: "Test APK endpoint failed",
      details: error.message,
      stack: error.stack
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
