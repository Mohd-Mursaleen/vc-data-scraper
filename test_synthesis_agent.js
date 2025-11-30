const SynthesisAgent = require('./agents/SynthesisAgent');
const GeminiService = require('./services/GeminiService');
require('dotenv').config();

async function testSynthesis() {
  console.log('🚀 Starting Synthesis Agent Test...');

  const gemini = new GeminiService();
  const synthesizer = new SynthesisAgent(gemini);

  // Mock SEBI Record
  const targetRecord = {
    "Name": "Ascent Capital",
    "Registration No.": "IN/VC/2024/001",
    "Contact Person": "Raja Kumar"
  };

  // Mock PageAnalyzer Results (Fragments)
  const pageResults = [
    {
      url: "https://ascentcapital.in/team",
      pageType: "team",
      facts: [
        { category: "team_member", fact: "Raja Kumar is the Founder and Managing Partner.", confidence: 99 },
        { category: "team_member", fact: "Subhasis Majumder is a Partner.", confidence: 99 },
        { category: "team_member", fact: "Deepak Gowda is a Partner.", confidence: 99 }
      ]
    },
    {
      url: "https://ascentcapital.in/portfolio",
      pageType: "portfolio",
      facts: [
        { category: "portfolio_company", fact: "Invested in BigBasket.", confidence: 95 },
        { category: "portfolio_company", fact: "Invested in Acko General Insurance.", confidence: 95 },
        { category: "fund_info", fact: "Fund III size is $350M.", confidence: 90 }
      ]
    },
    {
      url: "https://ascentcapital.in/about",
      pageType: "general",
      facts: [
        { category: "firm_info", fact: "Founded in 2008.", confidence: 98 },
        { category: "firm_info", fact: "Focuses on Technology and Healthcare.", confidence: 95 }
      ]
    }
  ];

  try {
    const finalJson = await synthesizer.execute(targetRecord, pageResults);
    
    console.log('\n' + '='.repeat(50));
    console.log('📊 FINAL SYNTHESIZED OUTPUT');
    console.log('='.repeat(50));
    console.log(JSON.stringify(finalJson, null, 2));

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testSynthesis();
