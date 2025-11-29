class NewsAgent {
  constructor(geminiService) {
    this.gemini = geminiService;
  }

  async execute(targetRecord) {
    const firmName = targetRecord.Name;
    const contactPerson = targetRecord['Contact Person'];
    const regNo = targetRecord['Registration No.'];
    console.log("\n📰 [News Agent] Gathering Enhanced Deal Intelligence...");

    const queries = [
      `List recent investment news URLs for Indian VC firm "${firmName}" (Contact: ${contactPerson})`,
      `Find fund size announcements for Indian VC firm "${firmName}" (Reg: ${regNo}) with source URLs`,
      `New fund launch news for Indian VC firm "${firmName}" partner "${contactPerson}" with links`,
      `Portfolio companies list for Indian VC firm "${firmName}" partner "${contactPerson}" with source links`,
      `Partner interviews for Indian VC firm "${firmName}" partner "${contactPerson}" with URLs`,
      `Latest deals 2024 2025 for Indian VC firm "${firmName}"  partner "${contactPerson}" with article links`,
      `TechCrunch articles about Indian VC firm "${firmName}"  partner "${contactPerson}" with URLs`,
      `Economic Times startup news for Indian VC firm "${firmName}"  partner "${contactPerson}" with links`
    ];

    console.log(`   🔎 Searching News with ${queries.length} queries...`);
    queries.forEach(q => console.log(`      👉 Query: ${q}`));

    const searchResults = await Promise.all(queries.map(q => this.gemini.generateContent(q)));
    const combinedContext = searchResults.join("\n\n=== NEXT SEARCH RESULT ===\n\n");
    
    // Sanitize
    const sanitizedContext = combinedContext.replace(/[^\x20-\x7E\n\r\t]/g, '');

    // Step 1: Use Google Search to find additional news URLs beyond initial context
    console.log("   🔍 Step 1: Searching for additional news URLs with Google Search...");
    const additionalSearchPrompt = `
      Find ALL news articles, press releases, and database entries for the Indian VC firm "${firmName}" (Contact: ${contactPerson}, SEBI Reg: ${regNo}).
      
      Look for:
      - Fund announcements (closings, sizes, launches) from 2015-2025
      - Deal announcements (investments, exits) from 2015-2025
      - Partner interviews and strategy articles
      - Database profiles (VCCircle, Tracxn, PitchBook, Entrackr)
      - Portfolio company funding rounds where this firm participated
      
      Return the complete list of URLs with what data each contains.
    `;
    
    const additionalSearchResult = await this.gemini.generateContent(additionalSearchPrompt);
    console.log(`   📝 Additional Search Result Length: ${additionalSearchResult.length}`);

    // Combine all context
    const fullContext = sanitizedContext + "\n\n=== ADDITIONAL SEARCH ===\n\n" + additionalSearchResult;

    // Step 2: Structured extraction WITHOUT tools
    console.log("   🧠 Step 2: Extracting and structuring news URLs...");
    const analysisPrompt = `
      You are a VC data analyst extracting news URLs for the Indian VC firm "${firmName}"
      (Contact: ${contactPerson}, SEBI Reg: ${regNo}).

      GOAL: Find ALL news articles, press releases, and database entries containing valuable data about this firm.

      SEARCH CONTEXT (from initial search and additional search):
      ${fullContext.substring(0, 40000)}

      CRITICAL INSTRUCTIONS:
      1. **Discover comprehensive news coverage** - both recent AND historical:
        - Fund announcements (closings, sizes, new fund launches): 2015-2025
         - Deal announcements (investments, exits): 2015-2025
         - Portfolio company funding rounds where this firm participated
         - Partner/GP interviews (insights on strategy, focus, performance)
         - Database profiles (VCCircle, Tracxn, PitchBook, Entrackr)
         - Press releases from the firm or portfolio companies
         - Award/recognition articles
      
      2. **Prioritize CLEAN, DIRECT URLs**:
         - Use actual article URLs (e.g., "https://www.vccircle.com/ascent-capital-closes-350m-fund")
         - Extract real URLs from redirect links when possible
         - For database sites, use the profile URL (e.g., "https://tracxn.com/d/companies/ascent-capital")
      
      3. **Look for SPECIFIC data points**:
         - Fund III: $350M closing (verify year)
         - Fund IV: $240M target/closing
         - Recent deals: Daya General Hospital ($17M, 2025), EnKash ($20M), etc.
         - Historical deals: BigBasket, FreshToHome, MyGlamm, KIMS, RBL Bank
         - Partner quotes and strategy insights
      
      4. **Provide detailed context** for each URL:
         - What specific information it contains (fund size, deal amount, partner name)
         - Date/year if available
         - Why it's valuable (e.g., "Confirms $350M Fund III final close in 2018")
      
      5. **Assign importance scores (1-100)**:
         - Fund announcements (closings, sizes): 90-100
         - Major deal announcements (>$10M): 85-95
         - Partner interviews/strategy articles: 70-80
         - Database profiles: 70-85
         - Portfolio company news (with firm mentioned): 75-85
         - Small deal mentions: 60-75
         - Historical deals (pre-2015): 55-70
         - General/vague mentions: 40-60
         - Irrelevant: 0-10
      
      6. **Be comprehensive**: Include 15-20 high-quality URLs covering:
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
