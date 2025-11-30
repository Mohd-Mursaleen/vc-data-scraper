const GeminiService = require('../services/GeminiService');
const DiscoveryAgent = require('../agents/DiscoveryAgent');
const NewsAgent = require('../agents/NewsAgent');
require('dotenv').config();

async function testAgents() {
  const gemini = new GeminiService();
  
  // Sample Record from sebi_records.json
  const sampleRecord = {
    "Name": "Ascent Capital",
    "Contact Person": "Manjunath Kallapur",
    "Registration No.": "IN/VC/11/0086"
  };

  console.log(`\n🧪 Testing Agents for: ${sampleRecord.Name}`);

  try {
    // 1. Test Discovery Agent
    console.log("\n-----------------------------------");
    console.log("🕵️  TESTING DISCOVERY AGENT");
    console.log("-----------------------------------");
    const discoveryAgent = new DiscoveryAgent(gemini);
    const discoveryResult = await discoveryAgent.execute(sampleRecord);
    console.log("\n📄 Discovery Result:");
    console.log(JSON.stringify(discoveryResult, null, 2));

    // 2. Test News Agent
    console.log("\n-----------------------------------");
    console.log("📰  TESTING NEWS AGENT");
    console.log("-----------------------------------");
    const newsAgent = new NewsAgent(gemini);
    const newsResult = await newsAgent.execute(sampleRecord);
    console.log("\n📄 News Result:");
    console.log(JSON.stringify(newsResult, null, 2));

    const combinedResult = {
      discovery: discoveryResult,
      news: newsResult
    };

    const fs = require('fs');
    fs.writeFileSync('test_output.json', JSON.stringify(combinedResult, null, 2));
    console.log("\n✅ Results saved to test_output.json");

  } catch (error) {
    console.error("❌ Test Failed:", error);
  }
}

// Run the test
testAgents();
