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
You are analyzing discovered URLs for researching the VC firm "${firmName}".

${firmContext}

DISCOVERED LINKS:
${linkList}

GOAL: Score each URL by importance (1-100) for VC research and categorize them.

SCORING GUIDELINES:

**High Priority (90-100):**
- LinkedIn profiles of GPs, Partners, Investment Team members
- Official VC firm pages (team, portfolio, funds, strategy, about)
- Recent deal announcements (2023-2025)
- Fund closing announcements
- Portfolio company websites (especially if mentioned in firm context)

**Medium Priority (70-89):**
- LinkedIn profiles of portfolio company founders/executives
- News articles about investments/exits (2020-2022)
- Industry database profiles (PitchBook, Crunchbase, Tracxn)
- Older fund announcements
- Press releases

**Low Priority (50-69):**
- Historical news (pre-2020)
- General press mentions
- Tangentially related companies
- Blog posts and interviews

**Very Low Priority (<50):**
- Unrelated companies or people
- Generic pages (privacy policy, terms, careers)
- Dead links or duplicates
- Social media (Twitter, Facebook, Instagram)

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

    parts.push(`FIRM CONTEXT FOR "${firmName}":`);

    if (firmInfo.contactPerson) {
      parts.push(`Contact Person: ${firmInfo.contactPerson}`);
    }

    if (firmInfo.registrationNo) {
      parts.push(`SEBI Registration: ${firmInfo.registrationNo}`);
    }

    if (firmInfo.knownTeam && firmInfo.knownTeam.length > 0) {
      parts.push(`\nKnown Team Members: ${firmInfo.knownTeam.join(', ')}`);
    }

    if (firmInfo.knownPortfolio && firmInfo.knownPortfolio.length > 0) {
      parts.push(`\nKnown Portfolio Companies: ${firmInfo.knownPortfolio.join(', ')}`);
    }

    if (firmInfo.sectors && firmInfo.sectors.length > 0) {
      parts.push(`\nFocus Sectors: ${firmInfo.sectors.join(', ')}`);
    }

    if (firmInfo.headquarters) {
      parts.push(`\nHeadquarters: ${firmInfo.headquarters}`);
    }

    return parts.join('\n');
  }
}

module.exports = LinkPrioritizationAgent;
