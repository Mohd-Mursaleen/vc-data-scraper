class DiscoveryAgent {
  constructor(geminiService) {
    this.gemini = geminiService;
  }

  async execute(targetRecord) {
    console.log("\n🕵️  [Discovery Agent] Starting...");

    // Parallel Searches for better coverage
    const queries = [
      `"${targetRecord.Name}" venture capital official website`,
      `"${targetRecord.Name}" VC firm LinkedIn`,
      `"${targetRecord.Name}" Crunchbase`
    ];

    console.log("   🔎 Running parallel searches...");
    const searchResults = await Promise.all(queries.map(q => this.gemini.generateContent(q)));
    const combinedContext = searchResults.join("\n\n=== NEXT SEARCH RESULT ===\n\n");

    // Sanitize
    const sanitizedContext = combinedContext.replace(/[^\x20-\x7E\n\r\t]/g, '');
    console.log(`   📝 Search Context Length: ${sanitizedContext.length}`);
    console.log(`   📝 Context Preview: ${sanitizedContext.substring(0, 500)}...`);

    const analysisPrompt = `
      Analyze the following search results for the VC firm "${targetRecord.Name}" 
      (Contact: ${targetRecord['Contact Person']}).

      SEARCH CONTEXT:
      ${sanitizedContext.substring(0, 20000)}

      INSTRUCTIONS:
      1. Identify the OFFICIAL website URL (prioritize .com, .in, .vc domains).
      2. Identify the OFFICIAL LinkedIn Company Page.
      3. Identify the Crunchbase profile (if any).
      4. Extract names of key people (GPs, Partners) mentioned.
    `;

    console.log("   🧠 Analyzing search results...");
    const analysisText = await this.gemini.generateContent(analysisPrompt);

    const extractionPrompt = `
      Based on the analysis below, extract the URLs and names into JSON.

      ANALYSIS:
      ${analysisText.substring(0, 5000)}

      INSTRUCTIONS:
      - Return **ONLY** valid, minified JSON.
      - Extract the actual DOMAIN URLs only (e.g., "https://www.ascentcapital.com")
      - **DO NOT** return Google search result URLs or any URLs containing "google.com" or "vertexai"
      - **CRITICAL**: Return clean URLs like "https://example.com", NOT search engine URLs
      - If multiple URLs found, pick the most official one (usually the .com or .in domain)
      - If no valid URL found, return null

      EXAMPLES:
      ✅ CORRECT: "https://www.ascentcapital.com"
      ✅ CORRECT: "https://ascentcapital.in"  
      ❌ WRONG: "https://vertexaisearch.cloud.google.com/..."
      ❌ WRONG: "https://www.google.com/search?q=..."

      JSON STRUCTURE:
      {
        "website": "https://www.example.com",
        "linkedin_company_url": "https://www.linkedin.com/company/example",
        "crunchbase_url": "https://www.crunchbase.com/organization/example",
        "key_people": ["Name 1", "Name 2"]
      }
    `;

    const schema = {
      type: "object",
      properties: {
        website: { type: "string", nullable: true },
        linkedin_company_url: { type: "string", nullable: true },
        crunchbase_url: { type: "string", nullable: true },
        key_people: { type: "array", items: { type: "string" } }
      }
    };

    console.log("   📝 Generating Discovery JSON...");
    // Disable tools for extraction to prevent hallucinations
    const result = await this.gemini.generateStructuredOutput(extractionPrompt, schema, null, []);
    
    console.log(`   ✅ Found: Web: ${result.website}, LinkedIn: ${result.linkedin_company_url}`);
    return result;
  }
}

module.exports = DiscoveryAgent;
