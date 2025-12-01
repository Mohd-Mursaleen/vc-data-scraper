class SynthesisAgent {
  constructor(geminiService) {
    this.gemini = geminiService;
  }

  /**
   * Synthesizes final VC firm report from all data sources
   * @param {Object} knowledgeBase - Contains targetRecord, pageAnalyses, linkedInData
   */
  async execute(knowledgeBase) {
    console.log("\n🧬 [Synthesis Agent] Compiling Final Intelligence Report...");

    // Extract all data sources
    const { targetRecord, pageAnalyses, linkedInData, linkedInCompanyData, gpProfileData } = knowledgeBase;

    // Build comprehensive SEBI context
    const sebiContext = this.buildSEBIContext(targetRecord);
    
    // Build aggregated data context
    const websiteContext = this.buildWebsiteContext(pageAnalyses);
    const linkedInContext = this.buildLinkedInContext(linkedInData);
    const linkedInCompanyContext = this.buildLinkedInCompanyContext(linkedInCompanyData);
    
    // Build GP Enrichment Context
    let gpEnrichmentContext = '';
    if (gpProfileData && gpProfileData.length > 0) {
      gpEnrichmentContext = this.buildLinkedInContext(gpProfileData).replace('LINKEDIN PROFILES', 'ENRICHED GP PROFILES');
    }

    const analysisPrompt = `
You are a Senior VC Research Analyst synthesizing a comprehensive intelligence report for the Indian VC firm "${targetRecord.Name}".

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 OFFICIAL SEBI REGISTRATION CONTEXT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${sebiContext}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔍 EXTRACTED INTELLIGENCE DATA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${websiteContext}

${linkedInContext}

${gpEnrichmentContext}

${linkedInCompanyContext}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎯 SYNTHESIS OBJECTIVES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Your task is to synthesize ALL the above data into a single, accurate, comprehensive report.

DATA SOURCES:
1. **SEBI Official Record**: Ground truth for firm name, contact person, registration
2. **Website Analysis**: Structured facts extracted from firm's website and news articles
   - Pre-categorized by type (fund_info, team_member, portfolio_company, etc.)
   - Each fact has a confidence score
3. **LinkedIn Profiles**: Scraped professional profiles of team members and founders
4. **Enriched GP Profiles**: Targeted deep-dive profiles of General Partners (Use this for detailed GP Backgrounds)
5. **LinkedIn Company Page**: Official firm description, size, and industry focus

CRITICAL RULES:
1. **CROSS-VALIDATE**: Use SEBI context as the source of truth for firm name, contact person, registration number
2. **DEDUPLICATE**: If a person/company appears in multiple sources, merge their information into one entry
3. **RESOLVE CONFLICTS**: 
   - For fund sizes: prefer website facts > LinkedIn mentions
   - For dates: prefer specific dates over year-only mentions
   - For team members: Combine website facts with LinkedIn backgrounds
   - For firm stats (size, founded): Combine website facts with LinkedIn Company Page data
4. **AGGREGATE**: Combine portfolio companies from all website facts
5. **VERIFY**: Cross-reference claims across sources before including them
6. **NO HALLUCINATIONS**: Only include data explicitly found in the sources above
7. **USE STRUCTURED FACTS**: The website data is already extracted into categorized facts - use these directly
8. **CONFIDENCE MATTERS**: Prioritize facts with higher confidence scores (>80%)

REQUIRED OUTPUT (16 Data Points):
1. **FIRM NAME** - Use exact SEBI registered name
2. **FUND NAMES** - All funds managed by this firm (Fund I, II, III, etc.)
3. **FUND SIZES (AUM)** - Total AUM and individual fund sizes with years
4. **GPs (General Partners)** - Full names and titles of all GPs/Partners
5. **GP BACKGROUNDS** - Brief career history of key GPs (education, previous roles)
6. **TEAM SIZE** - Total investment team size (approximate if exact not available)
7. **RECENT FUNDING ACTIVITY (2020-2025)** - Summary of recent deals with amounts and dates
8. **FUND START DATE** - When the first/earliest fund was launched
9. **FIRM START DATE** - When the firm was founded/established
10. **PORTFOLIO COMPANIES** - Comprehensive list of all portfolio companies
11. **PAST PERFORMANCE** - Exits, IPOs, successful investments, returns (if mentioned)
12. **INDUSTRY FOCUS** - Primary sectors/themes they invest in
13. **DEAL VELOCITY** - How many deals per year (recent years)
14. **AVG CHEQUE SIZE** - Typical investment amount range
15. **CHEQUE SIZE % OF ROUND** - What % of funding rounds they typically take
16. **PRIMARY CO-INVESTORS** - Frequent co-investment partners

NOW ANALYZE: Synthesize all the data above and prepare a coherent summary addressing all 16 data points.
    `;

    console.log("   🧠 Step 1: Analyzing and synthesizing all data sources...");
    const analysisText = await this.gemini.generateContent(analysisPrompt);

    const extractionPrompt = `
You are finalizing the structured JSON output for VC firm "${targetRecord.Name}" (SEBI: ${targetRecord['Registration No.']}).

SYNTHESIZED ANALYSIS:
${analysisText.substring(0, 20000)}

INSTRUCTIONS:
1. Carefully review the synthesized analysis above
2. <think>
   - Verify each data point is supported by the analysis
   - Cross-check names, numbers, and dates for accuracy
   - Ensure firm_name matches SEBI registration exactly: "${targetRecord.Name}"
   - Flag any uncertainties or data gaps
   - NO hallucinations - only data from the analysis
</think>
3. Extract and structure the 16 data points into the JSON schema below

QUALITY CHECKS:
✅ firm_name must exactly match: "${targetRecord.Name}"
✅ gps array must contain objects with "name" and "background" fields
✅ Each GP background should be 3-5 detailed sentences from LinkedIn data
✅ Fund sizes should include currency and year (e.g., "$100M (2020)")
✅ Dates should be as specific as possible (Year or Month Year)
✅ Portfolio companies should be deduplicated
✅ Use "Not available" or "Unknown" for missing data, never make up information
    `;

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
          description: "Fund sizes with years, e.g., ['Fund I: $100M (2018)', 'Fund II: $250M (2021)']"
        },
        gps: { 
          type: "array", 
          items: {
            type: "object",
            properties: {
              name: {
                type: "string",
                description: "Full name and title of the GP (e.g., 'John Doe, Managing Partner')"
              },
              background: {
                type: "string",
                description: "Detailed 3-5 sentence professional background including education, previous roles, expertise, and notable achievements"
              }
            },
            required: ["name", "background"]
          },
          description: "List of General Partners with their names and detailed backgrounds"
        },
        team_size: { 
          type: "string",
          description: "Total investment team size (e.g., '8-10 members' or 'Unknown')"
        },
        recent_funding_activity: { 
          type: "string",
          description: "Summary of investments from 2020-2025 with companies, amounts, and dates"
        },
        fund_start_date: { 
          type: "string",
          description: "Launch date of first/earliest fund (Year or Month Year)"
        },
        firm_start_date: { 
          type: "string",
          description: "Founding/establishment date of the firm (Year or Month Year)"
        },
        portfolio_companies: { 
          type: "array", 
          items: { type: "string" },
          description: "Comprehensive deduplicated list of all portfolio companies"
        },
        past_performance: { 
          type: "string",
          description: "Notable exits, IPOs, successful investments, returns, or 'Not available'"
        },
        industry_focus: { 
          type: "string",
          description: "Primary sectors, themes, or verticals they invest in"
        },
        deal_velocity: { 
          type: "string",
          description: "Number of deals per year in recent years (e.g., '10-12 deals/year' or 'Unknown')"
        },
        avg_cheque_size: { 
          type: "string",
          description: "Typical investment amount range (e.g., '$2M-$10M' or 'Unknown')"
        },
        cheque_size_pct_round: { 
          type: "string",
          description: "Typical percentage of funding round they take (e.g., '15-20%' or 'Unknown')"
        },
        primary_coinvestors: { 
          type: "array", 
          items: { type: "string" },
          description: "List of frequent co-investment partners/firms"
        }
      },
      required: [
        "firm_name", "fund_names", "fund_sizes", "gps",
        "team_size", "recent_funding_activity", "fund_start_date", "firm_start_date",
        "portfolio_companies", "past_performance", "industry_focus", "deal_velocity",
        "avg_cheque_size", "cheque_size_pct_round", "primary_coinvestors"
      ]
    };

    console.log("   📝 Step 2: Generating structured JSON output...");
    const result = await this.gemini.generateStructuredOutput(extractionPrompt, schema, null, []);
    
    console.log(`   ✅ Synthesis complete for ${result.firm_name}`);
    return result;
  }

  buildSEBIContext(targetRecord) {
    const parts = [];
    parts.push(`Firm Name: ${targetRecord.Name}`);
    parts.push(`SEBI Registration No.: ${targetRecord['Registration No.'] || 'N/A'}`);
    parts.push(`Contact Person: ${targetRecord['Contact Person'] || 'N/A'}`);
    parts.push(`Email: ${targetRecord['E-mail'] || 'N/A'}`);
    parts.push(`Address: ${targetRecord.Address || 'N/A'}`);
    parts.push(`Validity: ${targetRecord.Validity || 'N/A'}`);
    return parts.join('\n');
  }

  buildWebsiteContext(pageAnalyses) {
    if (!pageAnalyses || pageAnalyses.length === 0) {
      return 'WEBSITE ANALYSIS: No pages analyzed.';
    }

    const parts = [`WEBSITE ANALYSIS (${pageAnalyses.length} relevant pages analyzed):\n`];
    
    // Organize facts by category
    const factsByCategory = {
      fund_info: [],
      team_member: [],
      portfolio_company: [],
      contact_info: [],
      strategy: [],
      news_deal: [],
      other: []
    };

    pageAnalyses.forEach(analysis => {
      if (analysis.facts && analysis.facts.length > 0) {
        parts.push(`\n📄 Page: ${analysis.pageType} (${analysis.url})`);
        parts.push(`   Summary: ${analysis.page_summary}`);
        parts.push(`   Facts:`);
        
        analysis.facts.forEach(fact => {
          parts.push(`   - [${fact.category}] ${fact.fact} (confidence: ${fact.confidence}%)`);
          
          // Also collect by category for summary
          if (factsByCategory[fact.category]) {
            factsByCategory[fact.category].push(fact.fact);
          }
        });
      }
    });

    // Add category summaries
    parts.push('\n━━━ FACTS BY CATEGORY ━━━');
    for (const [category, facts] of Object.entries(factsByCategory)) {
      if (facts.length > 0) {
        parts.push(`\n${category.toUpperCase().replace('_', ' ')} (${facts.length} facts):`);
        facts.slice(0, 10).forEach(fact => parts.push(`  • ${fact}`));
        if (facts.length > 10) {
          parts.push(`  ... and ${facts.length - 10} more`);
        }
      }
    }

    return parts.join('\n');
  }

  buildLinkedInContext(linkedInData) {
    if (!linkedInData || linkedInData.length === 0) {
      return 'LINKEDIN PROFILES: No profiles scraped.';
    }
    const profiles = linkedInData.slice(0, 5).map(p => 
      `- ${p.name || 'Unknown'}: ${p.headline || 'N/A'} (${p.url || ''})`
    ).join('\n');
    return `LINKEDIN PROFILES (${linkedInData.length} scraped):\n${profiles}\n...`;
  }

  buildLinkedInCompanyContext(linkedInCompanyData) {
    if (!linkedInCompanyData || linkedInCompanyData.length === 0) {
      return 'LINKEDIN COMPANY PAGES: No company pages scraped.';
    }

    const parts = [`LINKEDIN COMPANY PAGES (${linkedInCompanyData.length} scraped):\n`];

    linkedInCompanyData.forEach(company => {
      const raw = company.raw || {};
      
      parts.push(`🏢 Company: ${company.name}`);
      parts.push(`   Tagline: ${raw.tagline || 'N/A'}`);
      parts.push(`   URL: ${company.url}`);
      parts.push(`   Description: ${company.description || raw.about || 'N/A'}`);
      parts.push(`   Industry: ${company.industry || raw.industry || 'N/A'}`);
      
      // Employee counts
      parts.push(`   Employees (LinkedIn): ${raw.employees_in_linkedin || 'N/A'}`);
      parts.push(`   Company Size Range: ${company.companySize || raw.company_size || 'N/A'}`);
      
      parts.push(`   Founded: ${company.founded || raw.founded_year || 'N/A'}`);
      parts.push(`   Headquarters: ${company.headquarters || raw.location || 'N/A'}`);
      parts.push(`   Website: ${company.website || raw.website || 'N/A'}`);
      
      // Specialties
      if (company.specialties && company.specialties.length > 0) {
        parts.push(`   Specialties: ${company.specialties.join(', ')}`);
      }

      // Locations (Detailed)
      if (raw.locations && raw.locations.length > 0) {
        const locs = raw.locations.map(l => 
          `${l.city || ''}, ${l.country || ''} (${l.is_headquarter ? 'HQ' : 'Office'})`
        ).filter(l => l.length > 5).join('; ');
        parts.push(`   Office Locations: ${locs}`);
      }

      // Similar Companies (Potential Co-investors/Competitors)
      if (raw.similar_companies && raw.similar_companies.length > 0) {
        const similar = raw.similar_companies.map(s => s.name).join(', ');
        parts.push(`   Similar Companies (Context): ${similar}`);
      }

      parts.push('');
    });

    return parts.join('\n');
  }
}

module.exports = SynthesisAgent;
