const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Simple config endpoint (without APK processing)
app.post("/api/config", async (req, res) => {
  try {
    const newConfig = req.body;

    // For now, just return the config that would be used
    // In a full implementation, this would trigger APK processing
    // on a different service/platform

    res.json({
      message: "Configuration received successfully",
      config: newConfig,
      note: "APK processing would be handled by a separate service",
    });
  } catch (error) {
    console.error("Config processing error:", error);
    res.status(500).json({
      error: "Configuration processing failed",
      details: error.message,
    });
  }
});

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({
    status: "Server is running",
    platform: "Vercel",
    timestamp: new Date().toISOString(),
  });
});

// Export for Vercel
module.exports = app;

// Start server locally
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
}
