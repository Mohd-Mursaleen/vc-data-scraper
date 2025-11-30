class LinkPrioritizationAgent {
  constructor(geminiService) {
    this.gemini = geminiService;
  }

  async execute(linkedInUrls, firmName, firmInfo = {}) {
    console.log('\n📊 Prioritizing LinkedIn URLs...');
    console.log(`   🔗 Total LinkedIn URLs: ${linkedInUrls.length}`);

    if (linkedInUrls.length === 0) {
      console.log('   ⚠️  No LinkedIn URLs to prioritize!');
      return [];
    }

    const uniqueLinkedIn = this.deduplicateLinks(
      linkedInUrls.map(link => ({
        url: link.url || link,
        text: link.text || link.context || '',
        source: link.source || 'linkedin'
      }))
    );

    console.log(`   ✅ Unique LinkedIn after dedup: ${uniqueLinkedIn.length}`);

    const batchSize = 50;
    const batches = [];
    
    for (let i = 0; i < uniqueLinkedIn.length; i += batchSize) {
      batches.push(uniqueLinkedIn.slice(i, i + batchSize));
    }

    console.log(`   🔄 Processing ${batches.length} batches...`);

    const allPrioritized = [];

    for (let i = 0; i < batches.length; i++) {
      console.log(`\n   [${i + 1}/${batches.length}] Processing batch of ${batches[i].length} LinkedIn URLs...`);
      
      const prioritized = await this.prioritizeBatch(batches[i], firmName, firmInfo);
      allPrioritized.push(...prioritized);

      if (i < batches.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    const sorted = allPrioritized.sort((a, b) => b.importance - a.importance);

    console.log('\n   ✅ Prioritization complete!');
    console.log(`   📊 Total LinkedIn URLs: ${sorted.length}`);
    console.log(`   📊 High priority (90-100): ${sorted.filter(l => l.importance >= 90).length}`);
    console.log(`   📊 Medium priority (70-89): ${sorted.filter(l => l.importance >= 70 && l.importance < 90).length}`);
    console.log(`   📊 Low priority (<70): ${sorted.filter(l => l.importance < 70).length}`);

    return sorted;
  }

  deduplicateLinks(links) {
    const seen = new Map();

    links.forEach(link => {
      const url = link.url;
      const cleanUrl = this.normalizeUrl(url);

      if (!seen.has(cleanUrl)) {
        seen.set(cleanUrl, link);
      } else {
        const existing = seen.get(cleanUrl);
        if (link.text && link.text.length > (existing.text || '').length) {
          seen.set(cleanUrl, link);
        }
      }
    });

    return Array.from(seen.values());
  }

  normalizeUrl(url) {
    let normalized = url.toLowerCase().trim();
    normalized = normalized.replace(/\/$/, '');
    normalized = normalized.replace(/^https?:\/\/(www\.)?/, '');
    normalized = normalized.split('#')[0];
    normalized = normalized.split('?')[0];
    return normalized;
  }

  filterScrapedUrls(links, scrapedUrls) {
    const scrapedNormalized = new Set(
      scrapedUrls.map(url => this.normalizeUrl(url))
    );

    return links.filter(link => {
      const normalized = this.normalizeUrl(link.url);
      return !scrapedNormalized.has(normalized);
    });
  }

  async prioritizeBatch(links, firmName, firmInfo) {
    const linkList = links.map((link, idx) => 
      `${idx + 1}. ${link.url}\n   Context: ${link.text || 'No context'}`
    ).join('\n\n');

    const firmContext = this.buildFirmContext(firmName, firmInfo);

    const prompt = `
You are a VC Research Analyst analyzing LinkedIn URLs for comprehensive research on the Indian VC firm "${firmName}".

${firmContext}

DISCOVERED LINKEDIN URLS:
${linkList}

RESEARCH OBJECTIVE:
We are building a complete intelligence profile for this VC firm. Your task is to prioritize which LinkedIn profiles will provide the most valuable data about:
1. Investment team (GPs, Partners, Analysts, Associates)
2. Portfolio companies and their founding teams
3. Co-investors and ecosystem partners
4. Fund history and performance indicators
5. Investment strategy and sector focus

PRIORITIZATION CRITERIA:

**CRITICAL (95-100):** 🔴 Must-scrape profiles
- LinkedIn profiles explicitly matching the Contact Person name: "${firmInfo.contactPerson || 'N/A'}"
- LinkedIn company page for "${firmName}" (exact or close match)
- Managing Partners, General Partners, Founding Partners at this firm
- Investment team members with titles: Partner, Principal, Director
- Profiles that mention "${firmName}" in current position

**HIGH PRIORITY (80-94):** ⭐ High-value profiles
- Investment Analysts, Associates, or Vice Presidents at this firm
- Portfolio company founders/CEOs (if company name matches known portfolio)
- Senior team members with 3+ years at this firm
- Alumni who were previously Partners/GPs at this firm
- LinkedIn profiles with email domain matching firm domain

**MEDIUM PRIORITY (60-79):** ✅ Valuable but not critical
- Junior investment team (Associates with <2 years)
- Portfolio company C-suite executives (CFO, CTO, COO)
- Advisors or Venture Partners to the firm
- Co-investors frequently mentioned alongside this firm
- Team members at portfolio companies (Series A+ funded)

**LOW PRIORITY (40-59):** ⚠️ Limited value
- Generic startup founders (no clear connection to firm)
- Interns or temporary staff at the firm
- Employees at portfolio companies (non-C-suite)
- Consultants or service providers to the firm
- LinkedIn profiles with vague or unclear affiliations

**VERY LOW PRIORITY (<40):** ❌ Skip these
- Profiles with no connection to VC firm or portfolio
- Personal profiles unrelated to venture capital
- Duplicate profiles (same person, different URL format)
- Profiles from completely different sectors/geographies
- Generic company pages (not VC-related)

MATCHING GUIDELINES:
- **Name Matching**: Pay special attention to "${firmInfo.contactPerson || ''}" and cross-reference with SEBI registration
- **Location Matching**: Profiles based in or near "${firmInfo.location || firmInfo.headquarters || 'India'}"
- **Email Domain**: Profiles with email containing firm name or domain
- **Recency**: Prefer current positions over past positions
- **Profile Completeness**: Well-maintained profiles with detailed experience > sparse profiles

CATEGORIES:
- linkedin_gp: LinkedIn profile of GP/Partner/Team member
- linkedin_founder: LinkedIn profile of portfolio company founder
- portfolio_company: Portfolio company website
- news_recent: News article (2020-2025)
- news_old: News article (pre-2020)
- fund_info: Fund announcements, closings, details
- firm_official: Official VC firm pages
- database: PitchBook, Crunchbase, Tracxn, etc.
- other: Everything else

IMPORTANT: 
- Use the firm context to identify relevant people, companies, and entities
- Higher scores for links that match known team members or portfolio companies
- Consider recency for news and deal announcements

Return a prioritized list with importance scores and categories.
`;

    const schema = {
      type: "object",
      properties: {
        prioritized_links: {
          type: "array",
          items: {
            type: "object",
            properties: {
              url: { type: "string", description: "The URL" },
              importance: { 
                type: "integer", 
                minimum: 1, 
                maximum: 100, 
                description: "Importance score" 
              },
              category: { 
                type: "string",
                description: "Link category",
                enum: [
                  "linkedin_gp",
                  "linkedin_founder", 
                  "portfolio_company",
                  "news_recent",
                  "news_old",
                  "fund_info",
                  "firm_official",
                  "database",
                  "other"
                ]
              },
              reasoning: { 
                type: "string", 
                description: "Brief reason for the score" 
              }
            },
            required: ["url", "importance", "category", "reasoning"]
          }
        }
      },
      required: ["prioritized_links"]
    };

    const result = await this.gemini.generateStructuredOutput(prompt, schema);
    
    return result.prioritized_links || [];
  }

  buildFirmContext(firmName, firmInfo) {
    const parts = [];

    parts.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    parts.push(`📋 SEBI REGISTERED FIRM CONTEXT FOR "${firmName}"`);
    parts.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    // Core SEBI Fields (always prioritize these)
    if (firmInfo.registrationNo) {
      parts.push(`🔖 SEBI Registration No: ${firmInfo.registrationNo}`);
    }

    if (firmInfo.contactPerson) {
      parts.push(`👤 Official Contact Person: ${firmInfo.contactPerson}`);
      parts.push(`   ⚠️  CRITICAL: Prioritize LinkedIn profiles matching this exact name`);
    }

    if (firmInfo.email) {
      parts.push(`📧 Official Email: ${firmInfo.email}`);
      const emailDomain = firmInfo.email.split('@')[1];
      if (emailDomain) {
        parts.push(`   🔍 Email Domain: ${emailDomain} (use for profile validation)`);
      }
    }

    if (firmInfo.location || firmInfo.headquarters) {
      parts.push(`📍 Location: ${firmInfo.location || firmInfo.headquarters}`);
    }

    if (firmInfo.address) {
      parts.push(`🏢 Registered Address: ${firmInfo.address}`);
    }

    if (firmInfo.validity) {
      parts.push(`✅ SEBI Validity: ${firmInfo.validity}`);
    }

    // Additional Intelligence (if available from discovery)
    if (firmInfo.knownTeam && firmInfo.knownTeam.length > 0) {
      parts.push(`\n👥 Known Team Members: ${firmInfo.knownTeam.join(', ')}`);
    }

    if (firmInfo.knownPortfolio && firmInfo.knownPortfolio.length > 0) {
      parts.push(`\n💼 Known Portfolio Companies: ${firmInfo.knownPortfolio.join(', ')}`);
    }

    if (firmInfo.sectors && firmInfo.sectors.length > 0) {
      parts.push(`\n🎯 Focus Sectors: ${firmInfo.sectors.join(', ')}`);
    }

    if (firmInfo.fundNames && firmInfo.fundNames.length > 0) {
      parts.push(`\n💰 Known Funds: ${firmInfo.fundNames.join(', ')}`);
    }

    parts.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    return parts.join('\n');
  }
}

module.exports = LinkPrioritizationAgent;
