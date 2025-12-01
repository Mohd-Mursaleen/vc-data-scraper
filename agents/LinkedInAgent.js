const BrightDataLinkedInScraper = require('../services/BrightDataLinkedInScraper');

class LinkedInAgent {
  constructor(geminiService) {
    this.gemini = geminiService;
    this.brightData = new BrightDataLinkedInScraper();
  }

  async execute(gpNames, firmName) {
    console.log("\n💼 [LinkedIn Agent] Deep Diving into GP Profiles...");
    const profiles = [];

    for (const name of gpNames) {
      console.log(`   🔎 Processing: ${name}`);
      
      // 1. Find Profile URL via Google
      // 1. Find Profile URL via Google
      const searchPrompt = `Find the LinkedIn profile URL for "${name}" who works at "${firmName}".`;
      
      const urlSchema = {
        type: "object",
        properties: {
          linkedin_url: { type: "string", nullable: true }
        }
      };

      const searchResult = await this.gemini.generateStructuredOutput(searchPrompt, urlSchema, null, []);
      const profileUrl = searchResult.linkedin_url;

      if (!profileUrl) {
        console.log(`   ❌ Could not find LinkedIn URL for ${name}`);
        continue;
      }

      console.log(`   🔗 Found URL: ${profileUrl}`);
      
      // 2. Try Apify Scrape
      let profileData = null;
      try {
        console.log("   Attempting Bright Data scrape...");
        const brightDataResult = await this.brightData.scrapeProfiles([profileUrl]);
        if (brightDataResult && brightDataResult.success && brightDataResult.profiles[0]) {
           profileData = this.brightData.formatProfiles(brightDataResult.profiles)[0];
           console.log("   ✅ Bright Data Success!");
        } else {
           throw new Error("Bright Data failed or returned empty");
        }
      } catch (e) {
        console.log(`   ⚠️  Bright Data failed (${e.message}). Switching to Google Fallback...`);
        
        // 3. Fallback: Google Search for Bio
        // 3. Fallback: Google Search for Bio
        const bioPrompt = `
          Search for the professional background/bio of "${name}" from "${firmName}".
          Focus on: Previous roles, Education, Investment focus.
        `;
        
        const bioSchema = {
            type: "object",
            properties: {
                about: { type: "string" },
                experience: { type: "array", items: { type: "string" } },
                education: { type: "array", items: { type: "string" } }
            }
        };

        const bioResult = await this.gemini.generateStructuredOutput(bioPrompt, bioSchema, null, []);
        
        profileData = {
          name: name,
          about: bioResult.about,
          experience: bioResult.experience,
          education: bioResult.education,
          url: profileUrl,
          source: "google_fallback"
        };
        console.log("   ✅ Google Fallback Success!");
      }

      profiles.push(profileData);
    }

    return profiles;
  }
}

module.exports = LinkedInAgent;
