class SynthesisAgent {
  constructor(geminiService) {
    this.gemini = geminiService;
  }

  async execute(targetRecord, pageResults) {
    console.log("\n🧪 [Synthesis Agent] Compiling Final Report...");

    // 1. Prepare the context from all page results
    const aggregatedFacts = pageResults.map((res, index) => {
      return `SOURCE ${index + 1} (${res.url} - ${res.pageType}):\n${JSON.stringify(res.facts, null, 2)}`;
    }).join("\n\n");

    const analysisPrompt = `
You are an expert VC Research Analyst. Your task is to synthesize a FINAL, ACCURATE report for "${targetRecord.Name}" (SEBI Reg: ${targetRecord['Registration No.']}) by aggregating data from multiple scraped pages.

OFFICIAL CONTEXT:
- Firm Name: ${targetRecord.Name}
- Contact Person: ${targetRecord['Contact Person']}
- SEBI Registration: ${targetRecord['Registration No.']}

EXTRACTED DATA FRAGMENTS (from different pages):
${aggregatedFacts}

YOUR GOAL:
Merge these fragments into a single, coherent knowledge base.
- **DEDUPLICATE**: If "John Doe" appears in Source 1 and Source 2, list him only once. Merge his details.
- **RESOLVE CONFLICTS**: If Source 1 says "Fund I: $100M" and Source 2 says "Fund I: $150M", prefer the more specific or recent source, or note the range.
- **AGGREGATE**: Combine portfolio companies from all sources into one list.

REQUIRED OUTPUT FIELDS (16 Data Points):
1. FIRM NAME
2. FUND NAMES
3. FUND SIZES (AUM)
4. GPS (General Partners)
5. GP BACKGROUNDS
6. TEAM SIZE
7. RECENT FUNDING ACTIVITY (2020-2025)
8. FUND START DATE
9. FIRM START DATE
10. PORTFOLIO COMPANIES
11. PAST PERFORMANCE
12. INDUSTRY FOCUS
13. DEAL VELOCITY
14. AVG CHEQUE SIZE
15. CHEQUE SIZE % OF ROUND
16. PRIMARY CO-INVESTORS

Analyze the data now.
    `;

    console.log("   🧠 Analyzing aggregated data...");
    const analysisText = await this.gemini.generateContent(analysisPrompt);

    const extractionPrompt = `
You are creating the FINAL JSON report for "${targetRecord.Name}".

SYNTHESIZED ANALYSIS:
${analysisText.substring(0, 15000)}

INSTRUCTIONS:
1. Analyze the provided synthesis carefully.
2. <think>
   - Review all extracted data points for accuracy.
   - Cross-reference conflicting details (e.g., fund sizes, dates).
   - Ensure no hallucinations; only use data from the SYNTHESIZED ANALYSIS.
   </think>
3. Populate the output fields based on your careful analysis.
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
