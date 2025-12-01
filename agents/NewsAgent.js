const GoogleSearchService = require('../services/GoogleSearchService');

class NewsAgent {
  constructor(geminiService) {
    this.gemini = geminiService;
    this.googleSearch = new GoogleSearchService();
  }

  async execute(targetRecord) {
    const firmName = targetRecord.Name;
    const contactPerson = targetRecord['Contact Person'];
    const regNo = targetRecord['Registration No.'];
    console.log("\n📰 [News Agent] Gathering Enhanced Deal Intelligence...");

    const queries = [
      `"${firmName}" fund announcement India`,
      `"${firmName}" investment news VCCircle`,
      `"${firmName}" ${contactPerson} interview`,
      `"${firmName}" portfolio companies funding`,
      `"${firmName}" deals 2024 2025`,
      `"${firmName}" VC India TechCrunch`,
      `"${firmName}" Economic Times startup`
    ];

    console.log(`   🔎 Running ${queries.length} Google searches...`);
    
    let allResults = [];
    for (const query of queries) {
      console.log(`      👉 Query: ${query}`);
      const results = await this.googleSearch.search(query, 5);
      
      if (results && results.length > 0) {
        console.log(`         Found ${results.length} results`);
        allResults = allResults.concat(results.map(r => ({
          title: r.title,
          link: r.link,
          snippet: r.snippet || ''
        })));
      }
      
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log(`   📝 Total news results: ${allResults.length}`);

    // Format results for Gemini
    const formattedResults = allResults.map((r, idx) => 
      `[${idx + 1}] ${r.title}\nURL: ${r.link}\nSnippet: ${r.snippet}\n${'─'.repeat(80)}`
    ).join('\n\n');

    // Step 2: Structured extraction WITHOUT tools
    console.log("   🧠 Step 2: Extracting and structuring news URLs...");
    const analysisPrompt = `
      You are a VC data analyst extracting news URLs for the Indian VC firm "${firmName}"
      (Contact: ${contactPerson}, SEBI Reg: ${regNo}).

      GOAL: Find ALL news articles, press releases, and database entries containing valuable data about this firm.

      GOOGLE SEARCH RESULTS:
      ${formattedResults}

      CRITICAL INSTRUCTIONS:
      1. **Extract URLs from the search results** covering:
        - Fund announcements (closings, sizes, new fund launches): 2015-2025
         - Deal announcements (investments, exits): 2015-2025
         - Portfolio company funding rounds where this firm participated
         - Partner/GP interviews (insights on strategy, focus, performance)
         - Database profiles (VCCircle, Tracxn, PitchBook, Entrackr)
         - Press releases and award/recognition articles
      
      2. **Use EXACT URLs from the results** - copy them as they appear
      
      3. **Provide detailed context** for each URL:
         - What specific information it contains (fund size, deal amount, partner name)
         - Date/year if available from the snippet
         - Why it's valuable
      
      4. **Assign importance scores (1-100)**:
         - Fund announcements (closings, sizes): 90-100
         - Major deal announcements (>$10M): 85-95
         - Partner interviews/strategy articles: 70-80
         - Database profiles: 70-85
         - Portfolio company news (with firm mentioned): 75-85
         - Small deal mentions: 60-75
         - Historical deals (pre-2015): 55-70
         - General/vague mentions: 40-60
         - Irrelevant: 0-10
      
      5. **Be comprehensive**: Include 15-20 high-quality URLs covering:
         - At least 2-3 fund announcements
         - At least 5-7 recent deals (2020-2025)
         - At least 3-4 historical deals/exits
         - At least 2-3 interviews or strategy articles
         - Database profiles (VCCircle, Tracxn, etc.)
    `;

    const schema = {
      type: "object",
      properties: {
        urls: {
          type: "array",
          description: "An array of URL discovery objects containing url, context, and importance.",
          items: {
            type: "object",
            properties: {
              url: { type: "string", description: "The discovered URL" },
              context: { type: "string", description: "Description of what this URL represents" },
              importance: { type: "integer", minimum: 1, maximum: 100, description: "Relevance score (1-100)" }
            },
            required: ["url", "context", "importance"]
          }
        }
      },
      required: ["urls"]
    };

    const result = await this.gemini.generateStructuredOutput(analysisPrompt, schema, null, []);
    
    console.log(`   ✅ News Insights: ${result.urls.length} relevant URLs found.`);
    return result;
  }
}

module.exports = NewsAgent;
