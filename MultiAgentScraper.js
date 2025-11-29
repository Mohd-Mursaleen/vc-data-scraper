const GeminiService = require('./services/GeminiService');
const DiscoveryAgent = require('./agents/DiscoveryAgent');
const WebsiteAgent = require('./agents/WebsiteAgent');
const NewsAgent = require('./agents/NewsAgent');
const LinkedInAgent = require('./agents/LinkedInAgent');
const SynthesisAgent = require('./agents/SynthesisAgent');
require('dotenv').config();

class MultiAgentScraper {
  constructor() {
    this.gemini = new GeminiService();
    this.knowledgeBase = {
      targetRecord: null,
      discovery: {},
      websiteContent: "",
      newsData: {},
      linkedInData: [],
      finalOutput: {}
    };
  }

  async run(targetRecord) {
    console.log(`\n🚀 Starting Multi-Agent Scraper for: ${targetRecord.Name}`);
    this.knowledgeBase.targetRecord = targetRecord;

    try {
      // 1. Discovery Agent
      const discoveryAgent = new DiscoveryAgent(this.gemini);
      this.knowledgeBase.discovery = await discoveryAgent.execute(targetRecord);
      console.log("✅ Discovery Complete");
      console.log(this.knowledgeBase.discovery);
      // 2. Website Agent
      if (this.knowledgeBase.discovery.website) {
        const websiteAgent = new WebsiteAgent(this.gemini);
        this.knowledgeBase.websiteContent = await websiteAgent.execute(this.knowledgeBase.discovery.website, targetRecord.Name);
        console.log("✅ Website Crawl Complete");
      } else {
        console.log("⚠️ No website found, skipping crawl.");
      }

      // 3. News Agent
      const newsAgent = new NewsAgent(this.gemini);
      this.knowledgeBase.newsData = await newsAgent.execute(targetRecord.Name);
      console.log("✅ News Intelligence Complete");

      // 4. LinkedIn Agent
      const linkedInAgent = new LinkedInAgent(this.gemini);
      // Combine GPs from discovery and website
      const potentialGPs = [
        ...(this.knowledgeBase.discovery.key_people || []),
        // Add any GPs found during website crawl (if we extracted them specifically, 
        // but for now we rely on the synthesis to extract them from text, 
        // so we might need to do an intermediate extraction step or just pass the text to LinkedIn Agent?
        // Actually, LinkedIn Agent needs NAMES. 
        // Let's extract names from website content first? 
        // For now, let's stick to Discovery names + News names.
      ];
      this.knowledgeBase.linkedInData = await linkedInAgent.execute(potentialGPs, targetRecord.Name);
      console.log("✅ LinkedIn Deep Dive Complete");

      // 5. Synthesis Agent
      const synthesisAgent = new SynthesisAgent(this.gemini);
      this.knowledgeBase.finalOutput = await synthesisAgent.execute(this.knowledgeBase);
      console.log("✅ Synthesis Complete");

      return this.knowledgeBase.finalOutput;

    } catch (error) {
      console.error("❌ Scraper Failed:", error);
      throw error;
    }
  }
}

// Allow running directly
if (require.main === module) {
  const scraper = new MultiAgentScraper();
  const sampleRecord = {
    "Name": "Ascent Capital",
    "Contact Person": "Manjunath Kallapur",
    "Registration No.": "IN/VC/11/0086" // Example
  };
  scraper.run(sampleRecord).then(result => {
    console.log("\n🎉 Final Result:", JSON.stringify(result, null, 2));
    const fs = require('fs');
    fs.writeFileSync('multi_agent_result.json', JSON.stringify(result, null, 2));
  });
}

module.exports = MultiAgentScraper;
