class GPLinkedInFinder {
  constructor(geminiService) {
    this.gemini = geminiService;
  }

  async execute(gpNames, firmName) {
    console.log('\n🔍 Finding LinkedIn Profiles for GPs...');
    console.log(`   👥 GPs to search: ${gpNames.length}`);

    const results = [];

    for (let i = 0; i < gpNames.length; i++) {
      const gpName = gpNames[i];
      console.log(`\n   [${i + 1}/${gpNames.length}] Searching: ${gpName}`);

      try {
        const profile = await this.findLinkedInProfile(gpName, firmName);
        
        results.push(profile);

        if (profile.found) {
          console.log(`   ✅ Found: ${profile.linkedin_url}`);
          console.log(`      ${profile.context}`);
        } else {
          console.log(`   ⚠️  Not found`);
        }

        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 2000));

      } catch (error) {
        console.log(`   ❌ Error: ${error.message}`);
        results.push({
          gp_name: gpName,
          linkedin_url: null,
          found: false,
          confidence: 0,
          context: `Error: ${error.message}`,
          firm: firmName
        });
      }
    }

    const foundCount = results.filter(r => r.found).length;
    console.log(`\n   📊 Found ${foundCount}/${gpNames.length} LinkedIn profiles`);

    return results;
  }

  async findLinkedInProfile(gpName, firmName) {
    // Step 1: Google Search with multiple queries
    const queries = [
      `"${gpName}" "${firmName}" LinkedIn profile India VC`,
      `"${gpName}" site:linkedin.com/in/ "${firmName}"`,
      `"${gpName}" venture capital India LinkedIn`
    ];

    console.log(`      🔎 Running ${queries.length} search queries...`);

    const searchResults = await Promise.all(
      queries.map(q => this.gemini.generateContent(q))
    );
    
    const combinedContext = searchResults.join('\n\n=== NEXT SEARCH ===\n\n');

    // Step 2: Structured extraction
    const extractionPrompt = `
You are finding the LinkedIn profile URL for a General Partner at an Indian VC firm.

TARGET PERSON:
- Name: ${gpName}
- Firm: ${firmName}
- Role: General Partner / Managing Partner / Founder

GOOGLE SEARCH RESULTS:
${combinedContext.substring(0, 15000)}

YOUR TASK:
1. Analyze the search results above
2. Find the LinkedIn profile URL that matches this person
3. Verify it's the correct person by checking:
   - Name matches: ${gpName}
   - Works at or associated with: ${firmName}
   - Profile URL format: linkedin.com/in/[username]
   - Title contains GP/Partner/Founder/Managing/Director

VALIDATION RULES:
- Only return URLs from linkedin.com/in/ (personal profiles, NOT company pages)
- Must be confident it's the right person (same name + firm connection)
- Prefer profiles with clear association to ${firmName}
- If multiple profiles exist, choose the one most clearly associated with the VC firm

OUTPUT INSTRUCTIONS:
- If found with high confidence: provide the URL, context, and confidence score (80-100)
- If found but uncertain: provide URL, context, and confidence score (50-79)
- If not found or no confident match: set found=false, confidence=0

Return structured data now.
`;

    const schema = {
      type: "object",
      properties: {
        found: {
          type: "boolean",
          description: "Whether a LinkedIn profile was found with confidence"
        },
        linkedin_url: {
          type: "string",
          description: "The LinkedIn profile URL if found, null otherwise"
        },
        confidence: {
          type: "integer",
          minimum: 0,
          maximum: 100,
          description: "Confidence score (0-100) that this is the correct person"
        },
        context: {
          type: "string",
          description: "Brief description of why this profile matches or why it wasn't found"
        }
      },
      required: ["found", "linkedin_url", "confidence", "context"]
    };

    const result = await this.gemini.generateStructuredOutput(extractionPrompt, schema);

    return {
      gp_name: gpName,
      firm: firmName,
      ...result
    };
  }

  formatResults(results) {
    const found = results.filter(r => r.found);
    const notFound = results.filter(r => !r.found);
    const highConfidence = results.filter(r => r.confidence >= 80);

    return {
      total: results.length,
      found: found.length,
      not_found: notFound.length,
      high_confidence: highConfidence.length,
      profiles: found.map(r => ({
        name: r.gp_name,
        url: r.linkedin_url,
        confidence: r.confidence,
        context: r.context
      })),
      missing: notFound.map(r => r.gp_name),
      all_results: results
    };
  }
}

module.exports = GPLinkedInFinder;
