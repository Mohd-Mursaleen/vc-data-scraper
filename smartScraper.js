const fs = require('fs');
const path = require('path');
require('dotenv').config();

const GeminiService = require('./services/GeminiService');
const WebsiteCrawler = require('./services/WebsiteCrawler');
const BrightDataLinkedInScraper = require('./services/BrightDataLinkedInScraper');

// --- Configuration ---
const TARGET_RECORD = {
  "Name": "Ascent Capital",
  "Contact Person": "Manjunath Kallapur",
  "Registration No.": "IN/AIF1/25-26/1857"
};

async function runPoC() {
  console.log("🚀 Starting Smart Scraper PoC for:", TARGET_RECORD.Name);

  const gemini = new GeminiService();
  const crawler = new WebsiteCrawler({ headless: true });
  const linkedinScraper = new BrightDataLinkedInScraper();

  try {
    // =================================================================
    // PHASE 1: DISCOVERY & VERIFICATION
    // =================================================================
    console.log("\n--- PHASE 1: Discovery (Gemini Search) ---");
    
    // =================================================================
    // PHASE 1: DISCOVERY & VERIFICATION
    // =================================================================
    console.log("\n--- PHASE 1: Discovery (Gemini Search) ---");
    
    // Step 1: Search and get raw text (Grounding enabled)
    const searchPrompt = `
      Find the official digital presence for the Venture Capital firm "${TARGET_RECORD.Name}" 
      (Contact Person: ${TARGET_RECORD['Contact Person']}, Reg No: ${TARGET_RECORD['Registration No.']}).
      
      I need you to find:
      1. The official website URL.
      2. The official LinkedIn Company Page URL.
      3. Key people (GPs/Partners).
      4. Verification if it is an active VC.

      Provide a summary of your findings.
    `;
    
    console.log("   🔎 Searching Google...");
    const searchResultText = await gemini.generateContent(searchPrompt);
    console.log("   ✅ Search complete. Analyzing results...");

    // Step 2: Extract JSON from the search result (No tools, just pure extraction)
    const extractionPrompt = `
      Analyze the following search results and extract the VC firm details into JSON.
      
      SEARCH CONTEXT:
      ${searchResultText}

      INSTRUCTIONS:
      - Return **ONLY** a valid, minified JSON object.
      - The "website" and "linkedin_company_url" fields must contain **ONLY** the URL string.
      - Do NOT include citations or markdown.

      JSON STRUCTURE:
      {
        "website": "https://www.example.com",
        "linkedin_company_url": "https://www.linkedin.com/company/example",
        "key_people": ["Name 1", "Name 2"],
        "is_active_vc": true
      }
    `;

    const discoverySchema = {
      type: "object",
      properties: {
        website: { type: "string" },
        linkedin_company_url: { type: "string" },
        key_people: { type: "array", items: { type: "string" } },
        is_active_vc: { type: "boolean" }
      }
    };

    // Pass empty array for tools to disable search during extraction
    const discoveryData = await gemini.generateStructuredOutput(extractionPrompt, discoverySchema, null, []);
    console.log("🔍 Discovery Result:", JSON.stringify(discoveryData, null, 2));

    if (!discoveryData.website) {
      throw new Error("Could not find a website for this firm.");
    }

    // =================================================================
    // PHASE 2: WEBSITE INTELLIGENCE
    // =================================================================
    console.log("\n--- PHASE 2: Website Intelligence (Crawling) ---");
    
    await crawler.initialize();
    const crawlResults = await crawler.crawlSite(discoveryData.website, TARGET_RECORD.Name);
    await crawler.close();

    // Aggregate all text from the crawl
    let websiteContext = "";
    for (const [pageType, data] of Object.entries(crawlResults)) {
      if (data.cleanText) {
        websiteContext += `\n--- Page: ${pageType} (${data.url}) ---\n${data.cleanText.substring(0, 5000)}\n`; // Limit per page to avoid context overflow
      }
    }
    console.log(`📄 Aggregated ${websiteContext.length} chars of website context.`);

    // =================================================================
    // PHASE 3: LINKEDIN DEEP DIVE (GP Backgrounds)
    // =================================================================
    console.log("\n--- PHASE 3: LinkedIn Deep Dive (Bright Data) ---");

    // 1. Identify who to scrape. Priority: Contact Person from Record + Key People from Discovery
    const peopleToSearch = [TARGET_RECORD['Contact Person'], ...(discoveryData.key_people || [])];
    const uniquePeople = [...new Set(peopleToSearch)].slice(0, 2); // Limit to top 2 for PoC
    
    const gpProfiles = [];

    for (const person of uniquePeople) {
      console.log(`   🔎 Finding LinkedIn for: ${person}`);
      // Use Gemini to find the specific profile URL to ensure high accuracy
      const profileSearchPrompt = `
        Find the LinkedIn public profile URL for "${person}" who works at "${TARGET_RECORD.Name}".
        Return JSON with "profile_url". If not found, return null.
      `;
      const profileSearchSchema = {
        type: "object",
        properties: { profile_url: { type: "string", nullable: true } }
      };
      
      const profileResult = await gemini.generateStructuredOutput(profileSearchPrompt, profileSearchSchema);
      
      if (profileResult.profile_url) {
        console.log(`      Found URL: ${profileResult.profile_url}`);
        // Call Bright Data
        try {
          const scrapeResult = await linkedinScraper.scrapeProfiles([profileResult.profile_url]);
          if (scrapeResult.success && scrapeResult.profiles.length > 0) {
            const profile = scrapeResult.profiles[0];
            gpProfiles.push({
              name: person,
              headline: profile.headline,
              summary: profile.summary || profile.about,
              experience: (profile.experience || []).map(e => `${e.title} at ${e.companyName}`).join('; '),
              url: profileResult.profile_url
            });
            console.log(`      ✅ Scraped profile for ${person}`);
          }
        } catch (err) {
          console.error(`      ❌ Failed to scrape LinkedIn for ${person}:`, err.message);
        }
      } else {
        console.log(`      ⚠️ No LinkedIn URL found for ${person}`);
      }
    }

    // =================================================================
    // PHASE 4: SYNTHESIS
    // =================================================================
    console.log("\n--- PHASE 4: Synthesis (Gemini Final Extraction) ---");

    const synthesisPrompt = `
      You are an expert VC Analyst. Analyze the collected data to build a comprehensive profile for the VC firm "${TARGET_RECORD.Name}".

      INPUT DATA:
      1. **Official Record**: ${JSON.stringify(TARGET_RECORD)}
      2. **Discovery Data**: ${JSON.stringify(discoveryData)}
      3. **Website Content**: ${websiteContext}
      4. **GP LinkedIn Profiles**: ${JSON.stringify(gpProfiles)}

      TASK:
      Extract the following 16 data points. Be precise. If data is missing, make a reasonable inference if possible or state "Not available".

      OUTPUT FORMAT (JSON):
      {
        "firm_name": "Name of the VC firm",
        "fund_names": ["Fund 1", "Fund 2"],
        "fund_sizes": ["$X Million", "₹Y Crore"],
        "gps": [
          { "name": "Name", "linkedin": "URL", "background": "Summary of background" }
        ],
        "team_size": "Estimated team size",
        "recent_funding_activity": "Summary of recent deals/activity",
        "fund_start_dates": ["Year1", "Year2"],
        "firm_start_date": "Year founded",
        "key_portfolio_companies": ["Company A", "Company B"],
        "past_performance": "Any mentioned IRR/Multiples or 'Not reported'",
        "industry_focus": "Sectors they focus on",
        "deal_velocity": "Estimated deals per year",
        "average_cheque_size": "Investment range",
        "cheque_size_percentage": "Typical % of round (if available)",
        "primary_co_investors": ["Investor A", "Investor B"],
        "analysis_notes": "Any other observations"
      }
    `;

    // We don't strictly enforce a schema here to let Gemini be flexible with lists/objects, 
    // but using responseMimeType: 'application/json' is good practice.
    // For this PoC, I'll use generateContent and expect JSON, or use a loose schema.
    // Let's use a schema to ensure the structure matches the user's request.
    
    const finalSchema = {
      type: "object",
      properties: {
        firm_name: { type: "string" },
        fund_names: { type: "array", items: { type: "string" } },
        fund_sizes: { type: "array", items: { type: "string" } },
        gps: { 
          type: "array", 
          items: { 
            type: "object",
            properties: {
              name: { type: "string" },
              linkedin: { type: "string" },
              background: { type: "string" }
            }
          } 
        },
        team_size: { type: "string" },
        recent_funding_activity: { type: "string" },
        fund_start_dates: { type: "array", items: { type: "string" } },
        firm_start_date: { type: "string" },
        key_portfolio_companies: { type: "array", items: { type: "string" } },
        past_performance: { type: "string" },
        industry_focus: { type: "string" },
        deal_velocity: { type: "string" },
        average_cheque_size: { type: "string" },
        cheque_size_percentage: { type: "string" },
        primary_co_investors: { type: "array", items: { type: "string" } },
        analysis_notes: { type: "string" }
      }
    };

    const finalResult = await gemini.generateStructuredOutput(synthesisPrompt, finalSchema);
    
    console.log("\n===================================================");
    console.log("🎉 FINAL ENRICHED RECORD");
    console.log("===================================================");
    console.log(JSON.stringify(finalResult, null, 2));

    // Save to file
    fs.writeFileSync('poc_result.json', JSON.stringify(finalResult, null, 2));
    console.log("\nSaved to poc_result.json");

  } catch (error) {
    console.error("❌ PoC Failed:", error);
  }
}

runPoC();
