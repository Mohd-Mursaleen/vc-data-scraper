const fs = require('fs');
const path = require('path');
const GeminiService = require('../services/GeminiService');
const SynthesisAgent = require('../agents/SynthesisAgent');
require('dotenv').config();

async function testSynthesis() {
  console.log('\n🧪 Testing Synthesis Agent...\n');

  const firmSlug = 'ascent-capital';
  const firmName = 'Ascent Capital';
  const dataDir = path.join('./data/firms', firmSlug);

  const firmInfo = {
    contactPerson: 'Manjunath Kallapur',
    registrationNo: 'IN/VC/11/0086'
  };

  const plainTextDir = path.join(dataDir, 'plain_text');

  if (!fs.existsSync(plainTextDir)) {
    console.log('❌ plain_text directory not found!');
    console.log('   Run run_smart_scraper.js first to scrape pages.');
    return;
  }

  const allPlainText = [];
  const files = fs.readdirSync(plainTextDir);

  files.forEach(file => {
    const content = fs.readFileSync(path.join(plainTextDir, file), 'utf-8');
    allPlainText.push(content);
  });

  console.log(`📄 Loaded ${allPlainText.length} plain text files\n`);

  if (allPlainText.length === 0) {
    console.log('⚠️  No plain text files found!');
    return;
  }

  const gemini = new GeminiService();
  const synthesizer = new SynthesisAgent(gemini);

  const combinedText = allPlainText.join('\n\n--- PAGE BREAK ---\n\n');

  const knowledgeBase = {
    targetRecord: {
      Name: firmName,
      'Contact Person': firmInfo.contactPerson,
      'Registration No.': firmInfo.registrationNo
    },
    discovery: {
      urls: []
    },
    websiteContent: combinedText,
    newsData: {
      summary: 'News data extracted from scraped pages'
    },
    linkedInData: []
  };

  const result = await synthesizer.execute(knowledgeBase);

  const outputPath = path.join(dataDir, 'synthesized_data.json');
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));

  console.log(`\n💾 Saved synthesized data to: ${outputPath}`);

  console.log('\n📊 Synthesized Data Overview:');
  console.log(`\n🏢 FIRM: ${result.firm_overview?.official_name || 'N/A'}`);
  console.log(`   Founded: ${result.firm_overview?.year_founded || 'N/A'}`);
  console.log(`   HQ: ${result.firm_overview?.headquarters || 'N/A'}`);
  
  if (result.funds && result.funds.length > 0) {
    console.log(`\n💰 FUNDS (${result.funds.length}):`);
    result.funds.forEach(fund => {
      console.log(`   • ${fund.name}: ${fund.size_usd || fund.size_inr || 'N/A'} (${fund.vintage_year || 'N/A'})`);
    });
  }

  if (result.team && result.team.length > 0) {
    console.log(`\n👥 TEAM (${result.team.length}):`);
    result.team.slice(0, 5).forEach(member => {
      console.log(`   • ${member.name} - ${member.title}`);
    });
    if (result.team.length > 5) {
      console.log(`   ... and ${result.team.length - 5} more`);
    }
  }

  if (result.portfolio && result.portfolio.length > 0) {
    console.log(`\n🏢 PORTFOLIO (${result.portfolio.length}):`);
    result.portfolio.slice(0, 5).forEach(company => {
      console.log(`   • ${company.company_name} (${company.status})`);
    });
    if (result.portfolio.length > 5) {
      console.log(`   ... and ${result.portfolio.length - 5} more`);
    }
  }

  if (result.investment_strategy) {
    console.log(`\n📈 STRATEGY:`);
    if (result.investment_strategy.sectors) {
      console.log(`   Sectors: ${result.investment_strategy.sectors.join(', ')}`);
    }
    if (result.investment_strategy.stages) {
      console.log(`   Stages: ${result.investment_strategy.stages.join(', ')}`);
    }
  }
}

testSynthesis();
