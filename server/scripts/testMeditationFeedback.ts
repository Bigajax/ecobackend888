/**
 * Test script for meditation feedback endpoint
 *
 * Usage:
 *   npm run test:meditation-feedback
 *
 * Or directly:
 *   npx ts-node server/scripts/testMeditationFeedback.ts
 */

import axios from "axios";
import { v4 as uuidv4 } from "uuid";

const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:3001";
const ENDPOINT = `${BASE_URL}/api/meditation/feedback`;

// Generate test identities
const sessionId = uuidv4();
const guestId = uuidv4();

console.log("🧪 Testing Meditation Feedback Endpoint");
console.log("=" .repeat(60));
console.log(`Base URL: ${BASE_URL}`);
console.log(`Session ID: ${sessionId}`);
console.log(`Guest ID: ${guestId}`);
console.log("");

// Test Case 1: Positive Feedback (Guest User)
async function testPositiveFeedbackGuest() {
  console.log("Test 1: Positive Feedback (Guest User)");
  console.log("-".repeat(60));

  const payload = {
    vote: "positive",
    meditation_id: "energy_blessing_1",
    meditation_title: "Bênçãos dos Centros de Energia",
    meditation_duration_seconds: 462,
    meditation_category: "energy_blessings",
    actual_play_time_seconds: 445,
    completion_percentage: 96.32,
    pause_count: 2,
    skip_count: 0,
    seek_count: 1,
    background_sound_id: "freq_1",
    background_sound_title: "432Hz",
    feedback_source: "meditation_completion"
  };

  try {
    const response = await axios.post(ENDPOINT, payload, {
      headers: {
        "Content-Type": "application/json",
        "X-Session-Id": sessionId,
        "X-Guest-Id": guestId
      }
    });

    console.log("✅ Success!");
    console.log(`Status: ${response.status}`);
    console.log(`Response:`, JSON.stringify(response.data, null, 2));
    console.log("");
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.log("❌ Error!");
      console.log(`Status: ${error.response?.status}`);
      console.log(`Response:`, JSON.stringify(error.response?.data, null, 2));
    } else {
      console.error("❌ Unexpected error:", error);
    }
    console.log("");
    throw error;
  }
}

// Test Case 2: Negative Feedback with Reasons
async function testNegativeFeedbackWithReasons() {
  console.log("Test 2: Negative Feedback with Reasons");
  console.log("-".repeat(60));

  const payload = {
    vote: "negative",
    reasons: ["too_long", "hard_to_focus"],
    meditation_id: "dr_joe_morning_1",
    meditation_title: "Meditação da Manhã - Dr. Joe Dispenza",
    meditation_duration_seconds: 1800,
    meditation_category: "dr_joe_dispenza",
    actual_play_time_seconds: 600,
    completion_percentage: 33.33,
    pause_count: 5,
    skip_count: 2,
    seek_count: 3
  };

  try {
    const response = await axios.post(ENDPOINT, payload, {
      headers: {
        "Content-Type": "application/json",
        "X-Session-Id": sessionId,
        "X-Guest-Id": guestId
      }
    });

    console.log("✅ Success!");
    console.log(`Status: ${response.status}`);
    console.log(`Response:`, JSON.stringify(response.data, null, 2));
    console.log("");
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.log("❌ Error!");
      console.log(`Status: ${error.response?.status}`);
      console.log(`Response:`, JSON.stringify(error.response?.data, null, 2));
    } else {
      console.error("❌ Unexpected error:", error);
    }
    console.log("");
    throw error;
  }
}

// Test Case 3: Validation Error - Missing Session ID
async function testMissingSessionId() {
  console.log("Test 3: Validation Error - Missing Session ID");
  console.log("-".repeat(60));

  const payload = {
    vote: "positive",
    meditation_id: "test_meditation",
    meditation_title: "Test Meditation",
    meditation_duration_seconds: 300,
    meditation_category: "test",
    actual_play_time_seconds: 300,
    completion_percentage: 100
  };

  try {
    const response = await axios.post(ENDPOINT, payload, {
      headers: {
        "Content-Type": "application/json",
        "X-Guest-Id": guestId
        // Missing X-Session-Id
      }
    });

    console.log("⚠️  Expected error but got success!");
    console.log(`Status: ${response.status}`);
    console.log(`Response:`, JSON.stringify(response.data, null, 2));
    console.log("");
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 400) {
        console.log("✅ Correctly rejected with 400!");
        console.log(`Response:`, JSON.stringify(error.response?.data, null, 2));
      } else {
        console.log("❌ Wrong error status:", error.response?.status);
      }
    } else {
      console.error("❌ Unexpected error:", error);
    }
    console.log("");
  }
}

// Test Case 4: Validation Error - Negative vote without reasons
async function testNegativeWithoutReasons() {
  console.log("Test 4: Validation Error - Negative without reasons");
  console.log("-".repeat(60));

  const payload = {
    vote: "negative",
    // reasons: missing!
    meditation_id: "test_meditation",
    meditation_title: "Test Meditation",
    meditation_duration_seconds: 300,
    meditation_category: "test",
    actual_play_time_seconds: 300,
    completion_percentage: 100
  };

  try {
    const response = await axios.post(ENDPOINT, payload, {
      headers: {
        "Content-Type": "application/json",
        "X-Session-Id": sessionId,
        "X-Guest-Id": guestId
      }
    });

    console.log("⚠️  Expected error but got success!");
    console.log(`Status: ${response.status}`);
    console.log(`Response:`, JSON.stringify(response.data, null, 2));
    console.log("");
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 400) {
        console.log("✅ Correctly rejected with 400!");
        console.log(`Response:`, JSON.stringify(error.response?.data, null, 2));
      } else {
        console.log("❌ Wrong error status:", error.response?.status);
      }
    } else {
      console.error("❌ Unexpected error:", error);
    }
    console.log("");
  }
}

// Run all tests
async function runAllTests() {
  console.log("");
  console.log("🚀 Running All Tests...");
  console.log("=".repeat(60));
  console.log("");

  try {
    // Successful cases
    await testPositiveFeedbackGuest();
    await testNegativeFeedbackWithReasons();

    // Error cases
    await testMissingSessionId();
    await testNegativeWithoutReasons();

    console.log("=".repeat(60));
    console.log("✅ All tests completed!");
    console.log("");
  } catch (error) {
    console.log("=".repeat(60));
    console.log("❌ Tests failed!");
    console.log("");
    process.exit(1);
  }
}

// Execute
runAllTests();
