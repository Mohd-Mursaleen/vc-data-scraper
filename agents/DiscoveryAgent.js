const GoogleSearchService = require('../services/GoogleSearchService');

class DiscoveryAgent {
  constructor(geminiService) {
    this.gemini = geminiService;
    this.googleSearch = new GoogleSearchService();
  }

  async execute(targetRecord) {
    console.log("\n🕵️  [Discovery Agent] Starting Enhanced Discovery...");

    // Use Google Search API for actual URLs
    const queries = [
      `"${targetRecord.Name}" official website`,
      `"${targetRecord.Name}" LinkedIn company page`,
      `"${targetRecord.Name}" VC fund India`,
      `"${targetRecord.Name}" ${targetRecord['Contact Person']} SEBI`
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

    console.log(`   📝 Total search results: ${allResults.length}`);

    // Format results for Gemini
    const formattedResults = allResults.map((r, idx) => 
      `[${idx + 1}] ${r.title}\nURL: ${r.link}\nSnippet: ${r.snippet}\n${'─'.repeat(80)}`
    ).join('\n\n');

    // Step 2: Structured extraction WITHOUT tools
    console.log("   🧠 Step 2: Extracting and structuring URLs...");
    const analysisPrompt = `
      You are a VC data analyst extracting URLs for the Indian VC firm "${targetRecord.Name}" 
      (Contact: ${targetRecord['Contact Person']}, SEBI Reg: ${targetRecord['Registration No.']}).

      GOAL: Build a comprehensive database of this VC fund. We need URLs containing:
      - Fund details (names, sizes, vintage years, closings)
      - Team information (GPs, Partners, backgrounds, bios)
      - Portfolio companies (current investments, exits)
      - Recent deals (2020-2025) and historical deals (pre-2020)
      - Investment strategy, sector focus, typical cheque size
      - Contact information and office details

      GOOGLE SEARCH RESULTS:
      ${formattedResults}

      CRITICAL INSTRUCTIONS:
      1. **Extract URLs from the search results above**:
         - Official website (homepage and important pages like /team, /portfolio, /funds)
         - LinkedIn company page
         - PitchBook/Tracxn investor profiles
         - News articles, press releases
         - Database listings
      
      2. **Use EXACT URLs from the results** - copy them as they appear
      
      3. **Infer likely pages** if you find the main website:
         - If you find "example.com", also suggest "example.com/team", "example.com/portfolio"
      
      4. **Provide detailed context** for each URL:
         - What specific data it contains
         - Why it's valuable
      
      5. **Assign importance scores (1-100)**:
         - Official website & key pages: 90-100
         - LinkedIn company page: 80-90
         - PitchBook/Tracxn: 70-85
         - Fund announcements/deals: 85-98
         - Partner interviews: 70-80
         - General news mentions: 50-70
      
      6. **Be comprehensive**: Include 10-15 high-quality URLs covering all aspects.
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
    
    console.log(`   ✅ Discovered ${result.urls.length} URLs.`);
    return result;
  }
}

module.exports = DiscoveryAgent;
