const GeminiService = require('../services/GeminiService');

class PageAnalyzer {
  constructor(geminiService) {
    this.gemini = geminiService || new GeminiService();
  }

  /**
   * Analyzes a single page's content to extract specific VC-related facts.
   * @param {string} text - The cleaned plain text of the page.
   * @param {string} url - The URL of the page (for context).
   * @param {string} pageType - Detected type of page (e.g., 'team', 'portfolio', 'general').
   * @returns {Promise<Object>} Structured facts extracted from the page.
   */
  async analyze(text, url, pageType = 'general') {
    console.log(`   🧠 [PageAnalyzer] Analyzing ${pageType} page: ${url}`);

    // 1. Construct a context-aware prompt
    const prompt = this.buildPrompt(text, url, pageType);

    // 2. Define the schema for structured output
    const schema = {
      type: "object",
      properties: {
        is_relevant: { 
          type: "boolean", 
          description: "True if this page contains ANY useful information for a VC database (Team, Portfolio, Funds, Contact)." 
        },
        page_summary: { 
          type: "string", 
          description: "A one-sentence summary of what this page is about." 
        },
        facts: {
          type: "array",
          description: "List of specific, high-value facts found on this page.",
          items: {
            type: "object",
            properties: {
              category: { 
                type: "string", 
                enum: ["fund_info", "team_member", "portfolio_company", "contact_info", "strategy", "news_deal", "other"],
                description: "The category of this fact."
              },
              fact: { 
                type: "string", 
                description: "The extracted fact. Be precise. Include numbers, dates, and names." 
              },
              confidence: {
                type: "integer",
                minimum: 1,
                maximum: 100,
                description: "Confidence score (1-100)."
              }
            },
            required: ["category", "fact", "confidence"]
          }
        }
      },
      required: ["is_relevant", "page_summary", "facts"]
    };

    // 3. Call Gemini
    try {
      // Use a slightly larger token limit for analysis if needed, but Flash is efficient.
      const result = await this.gemini.generateStructuredOutput(prompt, schema);
      
      if (result.is_relevant) {
        console.log(`   ✅ Extracted ${result.facts.length} facts from ${url}`);
      } else {
        console.log(`   🗑️  Page deemed irrelevant: ${url}`);
      }

      return result;

    } catch (error) {
      console.error(`   ❌ Page analysis failed for ${url}:`, error.message);
      return { is_relevant: false, facts: [], error: error.message };
    }
  }

  buildPrompt(text, url, pageType) {
    return `
      You are an expert VC Data Analyst. Your job is to extract **COMPREHENSIVE DETAILS** from a single webpage of a Venture Capital firm.
      
      PAGE CONTEXT:
      - URL: ${url}
      - Type: ${pageType.toUpperCase()}
      
      PAGE CONTENT:
      ${text.substring(0, 40000)}

      GOAL:
      Extract **ALL** relevant information available on the page. Do not summarize or abbreviate. We want the full richness of the data.

      CRITICAL FOCUS AREAS:

      1. **TEAM & GPs (General Partners)**:
         - Extract **EVERY** detail about key team members: Full Name, Exact Title, Education (Degrees, Universities), **Full Professional History** (Previous companies, roles, years), Board Seats, Investments led.
         - **Do not miss** details from "Expanded" or "Modal" sections (look for "--- EXTRACTED MODAL ---").
         - If a bio says "He led the investment in Uber and Airbnb while at Sequoia", capture that entire context.

      2. **FUNDS & AUM**:
         - Extract **EXACT** fund names (e.g., "Fund III", "Opportunity Fund I").
         - Extract **EXACT** sizes (e.g., "$350 Million", "₹2000 Crore").
         - Extract **DATES** (Vintage years, closing dates).
         - Extract investor details (LPs) if mentioned.

      3. **PORTFOLIO**:
         - Company Name, Sector, Description, Investment Stage, Status.
         - Any specific deal details (Investment amount, year, co-investors).

      WHAT TO LOOK FOR (based on Page Type):

      ${this.getTypeSpecificInstructions(pageType)}

      GENERAL INSTRUCTIONS:
      1. **Maximize Detail**: Prefer long, detailed facts over short summaries. 
      2. **Context Matters**: If a fund size is mentioned in a paragraph about strategy, extract the whole context.
      3. **Ignore Noise**: Still ignore navigation, footers, and generic marketing slogans (e.g., "We partner with visionary founders").
    `;
  }

  getTypeSpecificInstructions(pageType) {
    switch (pageType) {
      case 'team':
        return `
          - **EXTRACT EVERYTHING** for each person.
          - If the text contains a full bio paragraph, extract the **key sentences** that describe their background, not just "Ex-Google".
          - Example Fact: "Shub was previously a Managing Director at Matrix Partners where he led investments in Ola and Quikr. He holds an MBA from Harvard." (Capture the full richness).
        `;
      case 'portfolio':
        return `
          - Extract all company details.
          - If there are testimonials or case studies, extract the key metrics mentioned (e.g., "Grew revenue 10x").
        `;
      default:
        return `
          - Look for "About Us" sections that mention AUM, history, or specific fund closings.
          - Look for "Strategy" sections that define check sizes (e.g., "$1M - $5M") and sectors.
        `;
    }
  }
}

module.exports = PageAnalyzer;
