class NewsAgent {
  constructor(geminiService) {
    this.gemini = geminiService;
  }

  async execute(targetRecord) {
    const firmName = targetRecord.Name;
    const contactPerson = targetRecord['Contact Person'];
    const regNo = targetRecord['Registration No.'];
    console.log("\n📰 [News Agent] Gathering Enhanced Deal Intelligence...");

    const queries = [
      `List recent investment news URLs for Indian VC firm "${firmName}" (Reg: ${regNo})`,
      `Find fund size announcements for Indian VC firm "${firmName}" (Reg: ${regNo}) with source URLs`,
      `New fund launch news for Indian VC firm "${firmName}" with links`,
      `Portfolio companies list for Indian VC firm "${firmName}" with source links`,
      `Partner interviews for Indian VC firm "${firmName}" with URLs`,
      `Latest deals 2024 2025 for Indian VC firm "${firmName}" with article links`,
      `TechCrunch articles about Indian VC firm "${firmName}" with URLs`,
      `Economic Times startup news for Indian VC firm "${firmName}" with links`
    ];

    console.log(`   🔎 Searching News with ${queries.length} queries...`);
    queries.forEach(q => console.log(`      👉 Query: ${q}`));

    const searchResults = await Promise.all(queries.map(q => this.gemini.generateContent(q)));
    const combinedContext = searchResults.join("\n\n=== NEXT SEARCH RESULT ===\n\n");
    
    // Sanitize
    const sanitizedContext = combinedContext.replace(/[^\x20-\x7E\n\r\t]/g, '');

    const analysisPrompt = `
      Analyze the following news search results for the VC firm "${firmName}".
      
      SEARCH CONTEXT:
      ${sanitizedContext.substring(0, 30000)}

      INSTRUCTIONS:
      1. Identify ALL URLs that contain valuable data about this firm (Fund sizes, Deals, Portfolio).
      2. Look for news articles, press releases, blog posts, and database entries.
      3. For each URL, provide a brief context (e.g., "TechCrunch Article on Fund II", "Portfolio Page").
      4. Assign an importance score (1-100) based on data richness.
         - Fund Launch/Size Announcements: 90-100
         - Deal Announcements: 80-90
         - General Mentions: 50-70
         - Irrelevant: 0-10
    `;

    const schema = {
      type: "object",
      properties: {
        urls: {
          type: "array",
          description: "An array of URL discovery objects containing url, context, and importance.",
          items: {
            type: "object",
            properties: {
              url: { type: "string", description: "The discovered URL" },
              context: { type: "string", description: "Description of what this URL represents" },
              importance: { type: "integer", minimum: 1, maximum: 100, description: "Relevance score (1-100)" }
            },
            required: ["url", "context", "importance"]
          }
        }
      },
      required: ["urls"]
    };

    console.log("   📝 Generating News URL List...");
    const result = await this.gemini.generateStructuredOutput(analysisPrompt, schema, null, []);
    
    console.log(`   ✅ News Insights: ${result.urls.length} relevant URLs found.`);
    return result;
  }
}

module.exports = NewsAgent;
