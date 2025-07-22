// Simple test script to test the APK modification API
const { default: fetch } = require("node-fetch");

async function testAPKModification() {
  try {
    console.log("Testing APK modification API...");

    const response = await fetch("http://localhost:5000/api/download-apk", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: "https://hello.com",
      }),
    });

    if (response.ok) {
      console.log("✅ APK modification successful!");
      console.log("Response headers:", response.headers.raw());

      // Save the APK file
      const buffer = await response.buffer();
      require("fs").writeFileSync("test_modified.apk", buffer);
      console.log(
        `📦 Modified APK saved as test_modified.apk (${buffer.length} bytes)`
      );
    } else {
      const error = await response.json();
      console.error("❌ API Error:", error);
    }
  } catch (error) {
    console.error("❌ Test failed:", error.message);
  }
}

testAPKModification();
