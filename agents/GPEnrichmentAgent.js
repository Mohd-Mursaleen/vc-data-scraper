const BrightDataLinkedInScraper = require('../services/BrightDataLinkedInScraper');
const GoogleSearchService = require('../services/GoogleSearchService');

class GPEnrichmentAgent {
  constructor(geminiService) {
    this.gemini = geminiService;
    this.linkedInScraper = new BrightDataLinkedInScraper();
    this.googleSearch = new GoogleSearchService();
  }

  /**
   * Find and scrape LinkedIn profiles for a list of GPs
   * @param {Array<string>} gpNames - List of GP names
   * @param {string} firmName - Name of the VC firm
   * @returns {Promise<Array>} Scraped profile data
   */
  async execute(gpNames, firmName) {
    console.log('\n🕵️  [GP Enrichment Agent] Starting targeted search for GPs...');
    
    if (!gpNames || gpNames.length === 0) {
      console.log('   ⚠️  No GPs provided for enrichment.');
      return [];
    }

    const uniqueGPs = [...new Set(gpNames)];
    console.log(`   🎯 Targeting ${uniqueGPs.length} GPs: ${uniqueGPs.join(', ')}`);

    const foundUrls = [];

    // 1. Find LinkedIn URLs for each GP
    for (const rawGpName of uniqueGPs) {
      // Clean name: remove parentheses and extra whitespace
      const gpName = rawGpName.replace(/\s*\(.*?\)\s*/g, '').trim();
      console.log(`\n   🔎 Searching for: ${gpName}...`);
      
      // Step 1: Use Google Search API to get actual search results with URLs
      const queries = [
        `${gpName} ${firmName} LinkedIn`,

      ];

      console.log(`      🔍 Running ${queries.length} Google searches...`);
      
      let allResults = [];
      for (const query of queries) {
        console.log(`      👉 Query: ${query}`);
        const results = await this.googleSearch.search(query, 5); // Get top 5 results
        
        if (results && results.length > 0) {
          console.log(`         Found ${results.length} results`);
          allResults = allResults.concat(results.map(r => ({
            title: r.title,
            link: r.link,
            snippet: r.snippet || ''
          })));
        } else {
          console.log(`         No results`);
        }
        
        // Rate limit between queries
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      if (allResults.length === 0) {
        console.log(`      ❌ No search results found across ${queries.length} queries`);
        continue;
      }

      // Format search results for Gemini
      const formattedResults = allResults.map((r, idx) => 
        `[${idx + 1}] ${r.title}\nURL: ${r.link}\nSnippet: ${r.snippet}\n${'─'.repeat(80)}`
      ).join('\n\n');
      
      console.log(`      📝 Total results: ${allResults.length} (${formattedResults.length} chars)`);
      
      // Step 2: Send results to Gemini for extraction
      const extractionPrompt = `
        Extract the LinkedIn profile URL for "${gpName}", General Partner at "${firmName}".
        
        GOOGLE SEARCH RESULTS:
        ${formattedResults}
        
        INSTRUCTIONS:
        1. Look for URLs starting with "https://www.linkedin.com/in/" or "https://linkedin.com/in/"
        2. Choose the URL that best matches "${gpName}" (check the title and snippet)
        3. Return the EXACT URL as it appears in the results
        4. If no LinkedIn profile URL is found, return "NOT_FOUND"
        5. Verify the profile is for the correct person at "${firmName}" before returning
      `;

      const schema = {
        type: "object",
        properties: {
          linkedin_url: { 
            type: "string", 
            description: "The complete LinkedIn profile URL or 'NOT_FOUND'" 
          },
          confidence: { 
            type: "integer", 
            description: "Confidence score (0-100)" 
          },
          reasoning: {
            type: "string",
            description: "Which result number contained the URL and why you chose it"
          }
        },
        required: ["linkedin_url", "confidence"]
      };
      
      const result = await this.gemini.generateStructuredOutput(extractionPrompt, schema, null, []);
      
      console.log(`      🤔 Found: ${result.linkedin_url} (Confidence: ${result.confidence}%)`);
      if (result.reasoning) console.log(`      💭 ${result.reasoning}`);

      if (result.linkedin_url && result.linkedin_url !== 'NOT_FOUND' && result.linkedin_url.includes('linkedin.com/in/')) {
        console.log(`      ✅ Valid LinkedIn URL extracted`);
        foundUrls.push(result.linkedin_url);
      } else {
        console.log(`      ❌ No LinkedIn profile URL found in search results`);
      }

      // Rate limiting between GP searches
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    if (foundUrls.length === 0) {
      console.log('\n   ⚠️  No GP LinkedIn URLs found.');
      return [];
    }

    // 2. Scrape the profiles
    console.log(`\n   👤 Scraping ${foundUrls.length} GP profiles...`);
    
    // Filter out any company URLs just in case
    const validUrls = foundUrls.filter(u => !u.includes('/company/') && !u.includes('/school/'));

    if (validUrls.length > 0) {
      const result = await this.linkedInScraper.scrapeProfiles(validUrls);
      
      if (result.success) {
        const formatted = this.linkedInScraper.formatProfiles(result.profiles);
        console.log(`   ✅ Successfully enriched ${formatted.length} GP profiles.`);
        return formatted;
      } else {
        console.log(`   ❌ Failed to scrape GP profiles: ${result.message}`);
        return [];
      }
    }

    return [];
  }
}

module.exports = GPEnrichmentAgent;
