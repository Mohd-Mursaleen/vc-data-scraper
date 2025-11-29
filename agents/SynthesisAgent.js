class SynthesisAgent {
  constructor(geminiService) {
    this.gemini = geminiService;
  }

  async execute(knowledgeBase) {
    console.log("\n🧪 [Synthesis Agent] Compiling Final Report...");

    const { targetRecord, discovery, websiteContent, newsData, linkedInData } = knowledgeBase;

    const analysisPrompt = `
      You are a VC Analyst. Analyze the collected data to build a comprehensive profile for "${targetRecord.Name}".

      SOURCES:
      1. **Official Record**: ${JSON.stringify(targetRecord)}
      2. **Discovery**: ${JSON.stringify(discovery)}
      3. **News Intelligence**: ${JSON.stringify(newsData)}
      4. **GP Profiles**: ${JSON.stringify(linkedInData.map(p => ({ name: p.name, bio: p.about || p.summary })))}
      5. **Website Context**: ${websiteContent.substring(0, 15000)} (Truncated)

      INSTRUCTIONS:
      - Analyze all sources to extract the 16 required data points.
      - Use News Data for "Fund Size", "Recent Activity", "Cheque Size".
      - Use GP Profiles for "GP Background".
      - Draft the values for the final report.
    `;

    console.log("   🧠 Analyzing all data sources...");
    const analysisText = await this.gemini.generateContent(analysisPrompt);

    const extractionPrompt = `
      Based on the analysis below, create the final JSON report.

      ANALYSIS:
      ${analysisText.substring(0, 5000)}

      INSTRUCTIONS:
      - Return **ONLY** valid, minified JSON.
      - **NO DISCLAIMERS**.
      - If a value is not found, use "Not available".
      - **CRITICAL**: Do not repeat text. Keep fields concise.

      JSON STRUCTURE:
      {
        "firm_name": "Name",
        "fund_names": ["Fund I", "Fund II"],
        "fund_sizes": ["$X M", "$Y M"],
        "gps": ["Name 1", "Name 2"],
        "gp_backgrounds": "Summary of key partners' background",
        "team_size": "Number or 'Not available'",
        "recent_funding_activity": "Summary of deals",
        "fund_start_date": "Year",
        "firm_start_date": "Year",
        "portfolio_companies": ["Company A", "Company B"],
        "past_performance": "IRR/Multiples or 'Not available'",
        "industry_focus": "Sectors",
        "deal_velocity": "Deals/year",
        "avg_cheque_size": "Amount",
        "cheque_size_pct_round": "%",
        "primary_coinvestors": ["Investor A", "Investor B"]
      }
    `;

    const schema = {
      type: "object",
      properties: {
        firm_name: { type: "string" },
        fund_names: { type: "array", items: { type: "string" } },
        fund_sizes: { type: "array", items: { type: "string" } },
        gps: { type: "array", items: { type: "string" } },
        gp_backgrounds: { type: "string" },
        team_size: { type: "string" },
        recent_funding_activity: { type: "string" },
        fund_start_date: { type: "string" },
        firm_start_date: { type: "string" },
        portfolio_companies: { type: "array", items: { type: "string" } },
        past_performance: { type: "string" },
        industry_focus: { type: "string" },
        deal_velocity: { type: "string" },
        avg_cheque_size: { type: "string" },
        cheque_size_pct_round: { type: "string" },
        primary_coinvestors: { type: "array", items: { type: "string" } }
      }
    };

    console.log("   📝 Generating Final JSON...");
    const result = await this.gemini.generateStructuredOutput(extractionPrompt, schema, null, []);
    
    return result;
  }
}

module.exports = SynthesisAgent;
