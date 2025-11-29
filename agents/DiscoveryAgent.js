class DiscoveryAgent {
  constructor(geminiService) {
    this.gemini = geminiService;
  }

  async execute(targetRecord) {
    console.log("\n🕵️  [Discovery Agent] Starting Enhanced Discovery...");

    // Expanded Query Set for Maximum Coverage
    const queries = [
      `Official website for Indian VC firm "${targetRecord.Name}" (Contact: ${targetRecord['Contact Person']}, SEBI Registration: ${targetRecord['Registration No.']})`,
      `LinkedIn page for Indian VC firm "${targetRecord.Name}" (Contact: ${targetRecord['Contact Person']})`,
      `Pitchbook profile for Indian VC firm "${targetRecord.Name}" (Contact: ${targetRecord['Contact Person']})`
    ];

    console.log(`   🔎 Running ${queries.length} parallel searches...`);
    queries.forEach(q => console.log(`      👉 Query: ${q}`));
    
    const searchResults = await Promise.all(queries.map(q => this.gemini.generateContent(q)));
    const combinedContext = searchResults.join("\n\n=== NEXT SEARCH RESULT ===\n\n");

    // Sanitize
    const sanitizedContext = combinedContext.replace(/[^\x20-\x7E\n\r\t]/g, '');
    console.log(`   📝 Search Context Length: ${sanitizedContext.length}`);

    // Step 1: Use Google Search to find additional URLs beyond initial context
    console.log("   🔍 Step 1: Searching for additional URLs with Google Search...");
    const additionalSearchPrompt = `
      Find ALL relevant URLs for the Indian VC firm "${targetRecord.Name}" (Contact: ${targetRecord['Contact Person']}, SEBI Reg: ${targetRecord['Registration No.']}).
      
      Look for:
      - Official website and all its pages (team, portfolio, funds, strategy, about, contact)
      - LinkedIn company page
      - PitchBook/Tracxn profiles
      - News articles about fund announcements, deals, exits
      - Database listings
      
      Return the complete list of URLs with brief descriptions.
    `;
    
    const additionalSearchResult = await this.gemini.generateContent(additionalSearchPrompt);
    console.log(`   📝 Additional Search Result Length: ${additionalSearchResult.length}`);

    // Combine all context
    const fullContext = sanitizedContext + "\n\n=== ADDITIONAL SEARCH ===\n\n" + additionalSearchResult;

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

      SEARCH CONTEXT (from initial search and additional search):
      ${fullContext.substring(0, 40000)}

      CRITICAL INSTRUCTIONS:
      1. **Discover ALL relevant URLs** - both from the search context AND by inferring likely pages:
         - Official website pages: homepage, /team, /portfolio, /funds, /strategy, /about, /contact
         - LinkedIn company page
         - PitchBook/Tracxn investor profiles
         - News articles, press releases, interviews
         - Database listings (VCCircle, Entrackr, YourStory, TechCrunch, Economic Times)
      
      2. **Prioritize CLEAN, DIRECT URLs**:
         - Use actual website URLs (e.g., "https://www.ascentcapital.in/team")
         - Avoid redirect URLs unless they're the only source
         - For news sites, extract the actual article URL when possible
      
      3. **Infer likely pages** even if not explicitly mentioned:
         - If you find "ascentcapital.in", also suggest "/team", "/portfolio", "/funds"
         - These pages typically exist on VC firm websites
      
      4. **Provide detailed context** for each URL:
         - What specific data it contains
         - Why it's valuable (e.g., "Contains Fund III $350M closing announcement")
      
      5. **Assign importance scores (1-100)**:
         - Official website & inferred pages: 90-100
         - LinkedIn company page: 80-90
         - PitchBook/Tracxn: 70-85
         - Fund announcements/deals: 85-98
         - Partner interviews: 70-80
         - General news mentions: 50-70
         - Historical deals (pre-2020): 60-75
         - Irrelevant URLs: 0-10
      
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
