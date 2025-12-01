class GPBackgroundEnhancementAgent {
  constructor(geminiService) {
    this.gemini = geminiService;
  }

  /**
   * Enhance GP backgrounds in the final report using scraped LinkedIn profile data
   * @param {Object} synthesizedReport - The complete final report from SynthesisAgent
   * @param {Array} gpProfiles - Scraped LinkedIn profiles from GPEnrichmentAgent
   * @returns {Object} Enhanced report with detailed GP backgrounds
   */
  async execute(synthesizedReport, gpProfiles) {
    console.log('\n✨ [GP Background Enhancement Agent] Enriching GP Backgrounds...');
    
    if (!gpProfiles || gpProfiles.length === 0) {
      console.log('   ⚠️  No GP profiles to enhance with.');
      return synthesizedReport;
    }

    console.log(`   📊 Enhancing with ${gpProfiles.length} LinkedIn profile(s)`);
    
    // Create enhancement prompt with direct JSON
    const enhancementPrompt = `
You are re-synthesizing a VC firm intelligence report with newly acquired GP LinkedIn profile data.

EXISTING REPORT (Your baseline - keep most information):
${JSON.stringify(synthesizedReport, null, 2)}

NEW GP LINKEDIN PROFILES (JSON format):
${JSON.stringify(gpProfiles, null, 2)}

TASK:
Generate a COMPLETE, ENHANCED report using:
1. ALL existing data from the report above (firm name, funds, portfolio, deals, etc.)
2. NEW detailed GP information from the LinkedIn profiles JSON

ENHANCEMENT FOCUS:
- **gp_backgrounds**: Replace with detailed, comprehensive 3-5 sentence backgrounds for each GP using LinkedIn JSON data (name, headline, experience, education, skills, about)
- **gps**: Enhance GP names with titles from LinkedIn headline (e.g., "John Doe, Managing Partner")
- **team_size**: Update if you can infer from GP count or LinkedIn data
- Keep ALL other fields (funds, portfolio, deals, dates, etc.) from the existing report

QUALITY REQUIREMENTS:
✅ Use exact data from existing report for non-GP fields
✅ Create rich, detailed GP backgrounds from LinkedIn profile JSON
✅ Include specific: previous companies, years of experience, education, notable achievements from the experience and education arrays
✅ Professional tone, factual, no hallucinations
✅ If a GP from the report doesn't match a LinkedIn profile, keep their existing background
`;

    // Use the FULL schema from SynthesisAgent for complete report
    const schema = {
      type: "object",
      properties: {
        firm_name: { 
          type: "string",
          description: "Official SEBI registered firm name" 
        },
        fund_names: { 
          type: "array", 
          items: { type: "string" },
          description: "List of all fund names managed by this firm"
        },
        fund_sizes: { 
          type: "array", 
          items: { type: "string" },
          description: "Fund sizes with years"
        },
        gps: { 
          type: "array", 
          items: { type: "string" },
          description: "Full names and titles of GPs (enhanced with LinkedIn titles)"
        },
        gp_backgrounds: { 
          type: "string",
          description: "Detailed career backgrounds of GPs from LinkedIn (3-5 sentences per GP)"
        },
        team_size: { 
          type: "string",
          description: "Total investment team size"
        },
        recent_funding_activity: { 
          type: "string",
          description: "Summary of investments from 2020-2025"
        },
        fund_start_date: { 
          type: "string",
          description: "Launch date of first/earliest fund"
        },
        firm_start_date: { 
          type: "string",
          description: "Founding/establishment date of the firm"
        },
        portfolio_companies: { 
          type: "array", 
          items: { type: "string" },
          description: "Comprehensive list of all portfolio companies"
        },
        past_performance: { 
          type: "string",
          description: "Notable exits, IPOs, successful investments"
        },
        industry_focus: { 
          type: "string",
          description: "Primary sectors, themes, or verticals they invest in"
        },
        deal_velocity: { 
          type: "string",
          description: "Number of deals per year in recent years"
        },
        avg_cheque_size: { 
          type: "string",
          description: "Typical investment amount range"
        },
        cheque_size_pct_round: { 
          type: "string",
          description: "Typical percentage of funding round they take"
        },
        primary_coinvestors: { 
          type: "array", 
          items: { type: "string" },
          description: "List of frequent co-investment partners/firms"
        }
      },
      required: [
        "firm_name", "fund_names", "fund_sizes", "gps", "gp_backgrounds",
        "team_size", "recent_funding_activity", "fund_start_date", "firm_start_date",
        "portfolio_companies", "past_performance", "industry_focus", "deal_velocity",
        "avg_cheque_size", "cheque_size_pct_round", "primary_coinvestors"
      ]
    };

    console.log('   🧠 Generating enhanced comprehensive report...');
    const enhancedReport = await this.gemini.generateStructuredOutput(enhancementPrompt, schema, null, []);
    
    console.log(`   ✅ Enhanced report generated with detailed GP backgrounds`);
    
    return enhancedReport;
  }
}

module.exports = GPBackgroundEnhancementAgent;
