class NewsAgent {
  constructor(geminiService) {
    this.gemini = geminiService;
  }

  async execute(firmName) {
    console.log("\n📰 [News Agent] Gathering Deal Intelligence...");

    const queries = [
      `"${firmName}" investment "Series A" OR "Series B"`,
      `"${firmName}" fund size announcement`,
      `"${firmName}" new fund launch`,
      `"${firmName}" portfolio companies list`
    ];

    console.log("   🔎 Searching News...");
    const searchResults = await Promise.all(queries.map(q => this.gemini.generateContent(q)));
    const combinedContext = searchResults.join("\n\n=== NEXT SEARCH RESULT ===\n\n");
    
    // Sanitize
    const sanitizedContext = combinedContext.replace(/[^\x20-\x7E\n\r\t]/g, '');

    const analysisPrompt = `
      Analyze the following news search results for the VC firm "${firmName}".
      
      SEARCH CONTEXT:
      ${sanitizedContext.substring(0, 20000)}

      INSTRUCTIONS:
      Extract the following financial details. Be specific with numbers.
      
      1. Fund Names & Sizes (e.g. "Fund I: $50M", "Opportunity Fund: $100M")
      2. Recent Deal Activity (last 24 months)
      3. Average Cheque Size (if mentioned)
      4. Key Portfolio Companies mentioned in news
    `;

    console.log("   🧠 Analyzing news data...");
    const analysisText = await this.gemini.generateContent(analysisPrompt);

    const extractionPrompt = `
      Based on the analysis below, extract the financial details into JSON.

      ANALYSIS:
      ${analysisText.substring(0, 5000)}

      INSTRUCTIONS:
      - Return **ONLY** valid, minified JSON.
      - If a value is not found, use "Not available".
      - **CRITICAL**: Keep summaries concise (max 100 words). Do not repeat text.

      JSON STRUCTURE:
      {
        "fund_details": ["Fund I: $50M", "Fund II: $100M"],
        "recent_activity": "Summary of recent deals...",
        "avg_cheque": "$X Million or 'Not available'",
        "portfolio_mentions": ["Company A", "Company B"]
      }
    `;

    const schema = {
      type: "object",
      properties: {
        fund_details: { type: "array", items: { type: "string" } },
        recent_activity: { type: "string" },
        avg_cheque: { type: "string" },
        portfolio_mentions: { type: "array", items: { type: "string" } }
      }
    };

    console.log("   📝 Generating News JSON...");
    const result = await this.gemini.generateStructuredOutput(extractionPrompt, schema, null, []);
    
    console.log(`   ✅ News Insights: ${result.fund_details.length} funds found.`);
    return result;
  }
}

module.exports = NewsAgent;
