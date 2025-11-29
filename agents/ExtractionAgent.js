class ExtractionAgent {
  constructor(geminiService) {
    this.gemini = geminiService;
  }

  async execute(cleanedContent, url, firmName) {
    console.log(`   🧠 Extracting data from: ${url}`);

    const prompt = `
You are analyzing a page about the VC firm "${firmName}".

URL: ${url}
Title: ${cleanedContent.title || 'Untitled'}

CONTENT:
${cleanedContent.content}

Your task is to extract structured data AND discover valuable links.

EXTRACTION GOALS:
1. LINK DISCOVERY - Find and categorize important URLs:
   - LinkedIn profiles (GPs, partners, team members, portfolio founders)
   - Portfolio company websites
   - Additional news articles or press releases
   - Other relevant pages

2. DATA EXTRACTION - Extract any available information:
   - Fund details (names, sizes, vintage years, status, closings)
   - Team information (names, roles, backgrounds, LinkedIn profiles)
   - Portfolio companies (names, status: active/exited, sectors, deal details)
   - Recent deals and investments (dates, amounts, companies)
   - Investment strategy (sectors, stages, check sizes, geography)
   - Contact information (addresses, emails, phone)
   - Any other relevant data

IMPORTANT:
- For LinkedIn URLs, provide the full URL and person/company name
- For portfolio companies, note if they are active or exited
- Mark confidence level (high/medium/low) for each data point
- If information is not found, omit that field (don't make up data)
`;

    const schema = {
      type: "object",
      properties: {
        discovered_links: {
          type: "array",
          description: "Important URLs found in this page",
          items: {
            type: "object",
            properties: {
              url: { type: "string", description: "The discovered URL" },
              type: { 
                type: "string", 
                description: "Type of link",
                enum: ["linkedin_profile", "portfolio_company", "news_article", "other"]
              },
              context: { type: "string", description: "Who/what this link is about" },
              priority: { type: "integer", minimum: 1, maximum: 100, description: "Priority score" }
            },
            required: ["url", "type", "context", "priority"]
          }
        },
        extracted_data: {
          type: "object",
          description: "All data extracted from this page",
          properties: {
            funds: {
              type: "array",
              description: "Fund information",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  size: { type: "string" },
                  vintage_year: { type: "integer" },
                  status: { type: "string" },
                  confidence: { type: "string", enum: ["high", "medium", "low"] }
                }
              }
            },
            team: {
              type: "array",
              description: "Team member information",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  role: { type: "string" },
                  linkedin: { type: "string" },
                  background: { type: "string" },
                  confidence: { type: "string", enum: ["high", "medium", "low"] }
                }
              }
            },
            portfolio: {
              type: "array",
              description: "Portfolio companies",
              items: {
                type: "object",
                properties: {
                  company: { type: "string" },
                  status: { type: "string", enum: ["active", "exited", "unknown"] },
                  sector: { type: "string" },
                  deal_details: { type: "string" },
                  confidence: { type: "string", enum: ["high", "medium", "low"] }
                }
              }
            },
            strategy: {
              type: "object",
              description: "Investment strategy",
              properties: {
                sectors: { type: "array", items: { type: "string" } },
                stages: { type: "array", items: { type: "string" } },
                geography: { type: "string" },
                check_size: { type: "string" },
                confidence: { type: "string", enum: ["high", "medium", "low"] }
              }
            },
            contact: {
              type: "object",
              description: "Contact information",
              properties: {
                headquarters: { type: "string" },
                offices: { type: "array", items: { type: "string" } },
                email: { type: "string" },
                phone: { type: "string" },
                website: { type: "string" },
                confidence: { type: "string", enum: ["high", "medium", "low"] }
              }
            },
            recent_activity: {
              type: "array",
              description: "Recent deals, announcements, news",
              items: {
                type: "object",
                properties: {
                  date: { type: "string" },
                  event: { type: "string" },
                  details: { type: "string" },
                  confidence: { type: "string", enum: ["high", "medium", "low"] }
                }
              }
            }
          }
        }
      },
      required: ["discovered_links", "extracted_data"]
    };

    const result = await this.gemini.generateStructuredOutput(prompt, schema);
    
    console.log(`   ✅ Extracted ${result.discovered_links?.length || 0} links, data keys: ${Object.keys(result.extracted_data || {}).join(', ')}`);
    
    return result;
  }
}

module.exports = ExtractionAgent;
