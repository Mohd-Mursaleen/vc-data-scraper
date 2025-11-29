class DiscoveryAgent {
  constructor(geminiService) {
    this.gemini = geminiService;
  }

  async execute(targetRecord) {
    console.log("\n🕵️  [Discovery Agent] Starting Enhanced Discovery...");

    // Expanded Query Set for Maximum Coverage
    const queries = [
      `Official website for Indian VC firm "${targetRecord.Name}" (SEBI Registration: ${targetRecord['Registration No.']})`,
      `LinkedIn page for Indian VC firm "${targetRecord.Name}" (Registration: ${targetRecord['Registration No.']})`,
      `Pitchbook profile for Indian VC firm "${targetRecord.Name}"`
    ];

    console.log(`   🔎 Running ${queries.length} parallel searches...`);
    queries.forEach(q => console.log(`      👉 Query: ${q}`));
    
    const searchResults = await Promise.all(queries.map(q => this.gemini.generateContent(q)));
    const combinedContext = searchResults.join("\n\n=== NEXT SEARCH RESULT ===\n\n");

    // Sanitize
    const sanitizedContext = combinedContext.replace(/[^\x20-\x7E\n\r\t]/g, '');
    console.log(`   📝 Search Context Length: ${sanitizedContext.length}`);

    const analysisPrompt = `
      Analyze the following search results for the VC firm "${targetRecord.Name}" 
      (Contact: ${targetRecord['Contact Person']}).

      GOAL: We are building a comprehensive database of this VC fund. We need to gather:
      - Fund sizes and names (e.g., Fund I, Fund II)
      - Investment focus and sectors
      - Key people (GPs, Partners) and their backgrounds
      - Portfolio companies and recent deals
      - Contact information

      SEARCH CONTEXT:
      ${sanitizedContext.substring(0, 30000)}

      INSTRUCTIONS:
      1. Identify ALL relevant URLs that might contain the above data.
      2. Prioritize the Official Website, LinkedIn, and Pitchbook.
      3. Look for "Team" pages, "Portfolio" pages, and "About" pages.
      4. For each URL, provide a brief context (e.g., "Official Website - contains team info", "LinkedIn Page - has employee list").
      5. Assign an importance score (1-100) based on relevance for extracting firm data.
         - Official Website: 90-100
         - LinkedIn: 80-90
         - Pitchbook: 70-80
         - News Articles/Profiles: 60-80
         - Irrelevant/Spam: 0-10
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

    console.log("   🧠 Analyzing and extracting URLs...");
    const result = await this.gemini.generateStructuredOutput(analysisPrompt, schema, null, []);
    
    console.log(`   ✅ Discovered ${result.urls.length} URLs.`);
    return result;
  }
}

module.exports = DiscoveryAgent;
