const ApifyLinkedInScraper = require('../services/ApifyLinkedInScraper');

class LinkedInAgent {
  constructor(geminiService) {
    this.gemini = geminiService;
    this.apify = new ApifyLinkedInScraper();
  }

  async execute(gpNames, firmName) {
    console.log("\n💼 [LinkedIn Agent] Deep Diving into GP Profiles...");
    const profiles = [];

    for (const name of gpNames) {
      console.log(`   🔎 Processing: ${name}`);
      
      // 1. Find Profile URL via Google
      const searchPrompt = `Find the LinkedIn profile URL for "${name}" who works at "${firmName}". Return ONLY the URL.`;
      const searchResult = await this.gemini.generateContent(searchPrompt);
      // Extract URL from text (simple regex)
      const urlMatch = searchResult.match(/https:\/\/www\.linkedin\.com\/in\/[\w-]+/);
      const profileUrl = urlMatch ? urlMatch[0] : null;

      if (!profileUrl) {
        console.log(`   ❌ Could not find LinkedIn URL for ${name}`);
        continue;
      }

      console.log(`   🔗 Found URL: ${profileUrl}`);
      
      // 2. Try Apify Scrape
      let profileData = null;
      try {
        console.log("   Attempting Apify scrape...");
        const apifyResult = await this.apify.scrapeProfiles([profileUrl]);
        if (apifyResult && apifyResult[0] && !apifyResult[0].error) {
           profileData = apifyResult[0];
           console.log("   ✅ Apify Success!");
        } else {
           throw new Error("Apify failed or returned empty");
        }
      } catch (e) {
        console.log(`   ⚠️  Apify failed (${e.message}). Switching to Google Fallback...`);
        
        // 3. Fallback: Google Search for Bio
        const bioPrompt = `
          Search for the professional background/bio of "${name}" from "${firmName}".
          Focus on: Previous roles, Education, Investment focus.
        `;
        const bioText = await this.gemini.generateContent(bioPrompt);
        profileData = {
          name: name,
          about: bioText,
          experience: [], // Can't get structured exp from google easily without more work
          education: [],
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
