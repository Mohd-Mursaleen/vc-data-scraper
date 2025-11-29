class SynthesisAgent {
  constructor(geminiService) {
    this.gemini = geminiService;
  }

  async execute(knowledgeBase) {
    console.log("\n🧪 [Synthesis Agent] Compiling Final Report...");

    const { targetRecord, discovery, websiteContent, newsData, linkedInData } = knowledgeBase;

    const analysisPrompt = `
You are an expert VC Research Analyst analyzing comprehensive data about "${targetRecord.Name}" (SEBI Reg: ${targetRecord['Registration No.']}).

CONTEXT:
- Contact Person: ${targetRecord['Contact Person']}
- This is an Indian VC firm registered with SEBI
- You have access to multiple data sources: official website, news articles, team pages, portfolio information

DATA SOURCES:
1. **Official Record**: ${JSON.stringify(targetRecord)}
2. **Discovery URLs**: ${JSON.stringify(discovery)}
3. **News Intelligence**: ${JSON.stringify(newsData)}
4. **GP LinkedIn Profiles**: ${JSON.stringify(linkedInData.map(p => ({ name: p.name, bio: p.about || p.summary })))}
5. **Website Content** (${websiteContent.length} chars): ${websiteContent.substring(0, 40000)}

YOUR TASK - Extract the following 16 data points:

1. **FIRM NAME**: Official legal name and any common abbreviations
2. **FUND NAMES**: All fund names/vehicles (e.g., "Fund I", "Fund II", "Growth Trust")
3. **FUND SIZES**: AUM for each fund in USD/INR with vintage year
4. **GPS (General Partners)**: Full names of founding and managing partners
5. **GP BACKGROUNDS**: Educational and professional background of key GPs (2-3 sentences per GP)
6. **TEAM SIZE**: Total number of team members (investment team + support)
7. **RECENT FUNDING ACTIVITY**: Deals from 2020-2025 with company names, amounts, dates
8. **FUND START DATE**: When each fund was raised/closed
9. **FIRM START DATE**: Year the firm was founded/established
10. **PORTFOLIO COMPANIES**: All current and exited portfolio companies
11. **PAST PERFORMANCE**: IRR, multiples, successful exits (IPOs, acquisitions)
12. **INDUSTRY FOCUS**: Primary sectors/industries they invest in
13. **DEAL VELOCITY**: Average number of deals per year
14. **AVG CHEQUE SIZE**: Typical investment amount per deal
15. **CHEQUE SIZE % OF ROUND**: What % of funding round they typically take
16. **PRIMARY CO-INVESTORS**: Other VCs/investors they frequently co-invest with

EXTRACTION GUIDELINES:

**For Fund Sizes:**
- Look for phrases like "Fund III closed at $350M", "raised ₹2000 crore", "AUM of $600M"
- Match fund names with their sizes
- Note the vintage year (year of closing)

**For GP Backgrounds:**
- Find education (IIM, IIT, Harvard, etc.)
- Previous work experience (McKinsey, Goldman Sachs, etc.)
- Years of VC experience
- Notable achievements

**For Recent Activity:**
- Focus on deals from 2020-2025
- Extract: company name, sector, amount, date, series (A/B/C)
- Look for phrases like "invested in", "led $XM round", "participated in"

**For Portfolio:**
- Current active investments
- Successful exits (IPOs, acquisitions)
- Failed/written-off companies
- Sector classification

**For Industry Focus:**
- Primary sectors (Healthcare, Technology, Consumer, etc.)
- Sub-sectors (Fintech, SaaS, D2C, etc.)
- Geographic focus (India, US, Southeast Asia)

**For Co-investors:**
- Look for "co-invested with", "alongside", "syndicate with"
- Recurring names in deal announcements

ANALYSIS APPROACH:
1. Read through all content systematically
2. Cross-reference information from multiple sources
3. Prefer recent data over old data
4. Use official sources (website, SEBI) over news articles
5. Extract exact numbers, dates, and names
6. Note confidence level for each data point

Begin your analysis now. Be thorough and precise.
    `;

    console.log("   🧠 Analyzing all data sources...");
    const analysisText = await this.gemini.generateContent(analysisPrompt);

    const extractionPrompt = `
You are creating a final structured JSON report for "${targetRecord.Name}" based on detailed analysis.

ANALYSIS RESULTS:
${analysisText.substring(0, 8000)}

ORIGINAL DATA CONTEXT:
- Website Content Length: ${websiteContent.length} chars
- Number of News Sources: ${JSON.stringify(newsData).length > 50 ? 'Multiple' : 'Few'}
- LinkedIn Profiles: ${linkedInData.length}

EXTRACTION INSTRUCTIONS:

**CRITICAL RULES:**
1. Extract data ONLY from the analysis above - do NOT make up information
2. If a data point is not found, use "Not available" or empty array []
3. Use exact quotes for numbers (e.g., "$350M", "₹2000 crore")
4. Include years/dates wherever available
5. Keep arrays for multiple items (funds, GPs, portfolio companies)
6. For GP backgrounds: synthesize into 2-3 concise sentences highlighting education and key experience
7. For recent activity: focus on last 3-5 years (2020-2025)

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
