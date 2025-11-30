const fs = require('fs');
const path = require('path');
const GeminiService = require('../services/GeminiService');
const LinkPrioritizationAgent = require('../agents/LinkPrioritizationAgent');
require('dotenv').config();

async function testLinkPrioritization() {
  console.log('\n🧪 Testing Link Prioritization Agent...\n');

  const firmSlug = 'ascent-capital';
  const firmName = 'Ascent Capital';
  const dataDir = path.join('./data/firms', firmSlug);

  const firmInfo = {
    contactPerson: 'Manjunath Kallapur',
    registrationNo: 'IN/VC/11/0086',
    knownTeam: ['Raja Kumar', 'Manjunath Kallapur'],
    knownPortfolio: ['BigBasket', 'FreshToHome', 'ACKO', 'EnKash', 'Daya Hospital'],
    sectors: ['Healthcare', 'Pharma', 'Technology', 'Consumer'],
    headquarters: 'Bengaluru'
  };

  const linkedInQueuePath = path.join(dataDir, 'linkedin_queue.json');

  let linkedInUrls = [];
  if (fs.existsSync(linkedInQueuePath)) {
    linkedInUrls = JSON.parse(fs.readFileSync(linkedInQueuePath, 'utf-8'));
  }

  console.log(`🔗 LinkedIn URLs to score: ${linkedInUrls.length}\n`);

  const gemini = new GeminiService();
  const prioritizer = new LinkPrioritizationAgent(gemini);

  const prioritized = await prioritizer.execute(
    linkedInUrls,
    firmName,
    firmInfo
  );

  const highValueLinkedIn = prioritized.filter(link => link.importance >= 60);

  const outputPath = path.join(dataDir, 'linkedin_prioritized.json');
  fs.writeFileSync(outputPath, JSON.stringify(highValueLinkedIn, null, 2));

  console.log(`\n💾 Saved ${highValueLinkedIn.length} high-value LinkedIn URLs (score >= 60) to: ${outputPath}`);
  console.log(`   🗑️  Filtered out ${prioritized.length - highValueLinkedIn.length} low-value URLs (score < 60)`);

  if (highValueLinkedIn.length > 0) {
    console.log('\n📈 High-Value LinkedIn Profiles:');
    highValueLinkedIn.forEach((link, idx) => {
      console.log(`\n${idx + 1}. [${link.importance}] ${link.category}`);
      console.log(`   ${link.url}`);
      console.log(`   ${link.reasoning}`);
    });
  } else {
    console.log('\n   ⚠️  No LinkedIn URLs with score >= 60 found.');
  }
}

testLinkPrioritization();
