const WebsiteCrawler = require('../services/WebsiteCrawler');

class WebsiteAgent {
  constructor(geminiService) {
    this.gemini = geminiService;
    this.crawler = new WebsiteCrawler();
  }

  async execute(websiteUrl, firmName) {
    console.log("\n🕷️  [Website Agent] Starting Intelligent Crawl...");
    
    await this.crawler.initialize();
    
    let websiteContext = "";
    const visitedUrls = new Set();
    const maxDepth = 4;
    let currentUrl = websiteUrl;
    let depth = 0;

    try {
      while (depth < maxDepth && currentUrl) {
        if (visitedUrls.has(currentUrl)) {
          console.log(`   ⚠️  Already visited ${currentUrl}, skipping.`);
          break;
        }
        visitedUrls.add(currentUrl);
        depth++;

        // 1. Visit & Extract
        const pageData = await this.crawler.extractPageData(currentUrl);
        if (pageData.error) {
          console.log(`   ❌ Error visiting ${currentUrl}: ${pageData.error}`);
          break;
        }

        // Append to context
        const pageSummary = `\n--- Page: ${pageData.url} ---\n${pageData.cleanText.substring(0, 8000)}\n`;
        websiteContext += pageSummary;
        console.log(`   📄 Extracted ${pageData.cleanText.length} chars from ${currentUrl}`);

        // 2. Analyze & Decide Next Step
        const analysisPrompt = `
          We are scraping the VC firm "${firmName}" to find:
          - Team members / GPs
          - Portfolio companies
          - Fund details
          - Contact info

          CURRENT CONTEXT:
          ${websiteContext.substring(Math.max(0, websiteContext.length - 15000))} 

          AVAILABLE LINKS:
          ${JSON.stringify(pageData.links.slice(0, 50).map(l => ({ text: l.text, href: l.href })))}

          INSTRUCTIONS:
          1. Analyze context. Do we have all info?
          2. If NOT, pick SINGLE best link to visit next.
          3. Prioritize "Team", "People", "Portfolio", "Funds".

          OUTPUT JSON:
          {
            "next_url": "URL_TO_VISIT_OR_NULL",
            "reason": "Reasoning"
          }
        `;

        const schema = {
          type: "object",
          properties: {
            next_url: { type: "string", nullable: true },
            reason: { type: "string" }
          }
        };

        console.log("   🧠 Deciding next step...");
        const decision = await this.gemini.generateStructuredOutput(analysisPrompt, schema, null, []);
        
        if (decision.next_url && !visitedUrls.has(decision.next_url)) {
          console.log(`   👉 Next Stop: ${decision.next_url} (${decision.reason})`);
          currentUrl = decision.next_url;
        } else {
          console.log("   🛑 Stopping crawl.");
          currentUrl = null;
        }
      }
    } catch (error) {
      console.error("   ❌ Website Agent Error:", error);
    } finally {
      await this.crawler.close();
    }

    return websiteContext;
  }
}

module.exports = WebsiteAgent;
