const axios = require('axios');
require('dotenv').config();
class GoogleSearchService {
  constructor() {
    this.apiKey = process.env.GOOGLE_SEARCH_API_KEY ;
    this.searchEngineId = process.env.GOOGLE_SEARCH_ENGINE_ID ;
    if (!this.apiKey || !this.searchEngineId) {
      console.warn('⚠️ Google Search API not configured');
    }
  }

  // Try multiple search terms and always filter out SEBI links, log every step
  async findHomepage({ name, regNum, email }) {
    const queries = [
      `"${name}" official site`,
      `"${name}" fund website`,
      `"${name}" portfolio`,
      `"${name}" venture capital`,
      `"${name}" AIF`,
      `"${name}" private equity`,
      regNum ? `${name} ${regNum}` : null,
      email ? email.split('@')[1] : null,
    ].filter(Boolean);

    for (const q of queries) {
      console.log(`   [search] Query: ${q}`);
      const results = await this.search(q, 5);
      if (!results || !results.length) {
        console.log(`      [search] No results for query.`);
        continue;
      }
      // Log all results for visibility
      results.forEach((r, i) => {
        console.log(`      [result ${i+1}] ${r.title} ${r.link}`);
      });
      // Filter out SEBI and .gov.in links
      const found = results.find(r =>
        r.link &&
        !r.link.includes('sebi.gov.in') &&
        !r.link.includes('.gov.in') &&
        !/sebi/i.test(r.title || '') &&
        /^https?:\/\//.test(r.link)
      );
      if (found) {
        console.log(`      [chosen] Using homepage: ${found.link} Title: ${found.title}`);
        return found;
      } else {
        console.log(`      [search] All results were SEBI or .gov.in links; continuing.`);
      }
    }
    // Fallback to email domain if available
    if (email) {
      const domain = email.split('@')[1];
      if (domain) {
        console.log(`      [fall-back] Using homepage from email domain: https://${domain}`);
        return { link: `https://${domain}`, title: domain };
      }
    }
    console.log('      [fail] No homepage found!');
    return null;
  }

  async search(query, num = 1) {
    if (!this.apiKey || !this.searchEngineId) return [];
    try {
      const resp = await axios.get('https://www.googleapis.com/customsearch/v1', {
        params: { 
          key: this.apiKey, 
          cx: this.searchEngineId, 
          q: query, 
          num,
          gl: 'in' // Set search location to India
        }
      });
      return resp.data.items || [];
    } catch (e) {
      console.error('[GoogleSearchService] Google search failed:', e.message);
      return [];
    }
  }
}

module.exports = GoogleSearchService;
