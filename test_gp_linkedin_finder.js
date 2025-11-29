const fs = require('fs');
const path = require('path');
const GeminiService = require('./services/GeminiService');
const GPLinkedInFinder = require('./agents/GPLinkedInFinder');
require('dotenv').config();

async function findGPLinkedInProfiles() {
  console.log('\n🧪 Testing GP LinkedIn Finder...\n');

  const firmSlug = 'ascent-capital';
  const dataDir = path.join('./data/firms', firmSlug);

  // Load synthesized data
  const synthesizedPath = path.join(dataDir, 'synthesized_data.json');

  if (!fs.existsSync(synthesizedPath)) {
    console.log('❌ synthesized_data.json not found!');
    console.log('   Run the full pipeline first.');
    return;
  }

  const synthesizedData = JSON.parse(fs.readFileSync(synthesizedPath, 'utf-8'));

  const firmName = synthesizedData.firm_name;
  const gpNames = synthesizedData.gps || [];

  if (gpNames.length === 0) {
    console.log('⚠️  No GPs found in synthesized data!');
    return;
  }

  console.log(`🏢 Firm: ${firmName}`);
  console.log(`👥 GPs: ${gpNames.join(', ')}\n`);

  const gemini = new GeminiService();
  const finder = new GPLinkedInFinder(gemini);

  // Find LinkedIn profiles
  const results = await finder.execute(gpNames, firmName);

  // Format results
  const formattedResults = finder.formatResults(results);

  // Save results
  const outputPath = path.join(dataDir, 'gp_linkedin_profiles.json');
  fs.writeFileSync(outputPath, JSON.stringify(formattedResults, null, 2));

  console.log(`\n💾 Saved results to: ${outputPath}`);

  console.log('\n📊 Summary:');
  console.log(`   Total GPs: ${formattedResults.total}`);
  console.log(`   ✅ Found: ${formattedResults.found}`);
  console.log(`   ❌ Not Found: ${formattedResults.not_found}`);

  if (formattedResults.profiles.length > 0) {
    console.log('\n✅ Found LinkedIn Profiles:');
    formattedResults.profiles.forEach((profile, idx) => {
      console.log(`\n${idx + 1}. ${profile.name}`);
      console.log(`   ${profile.url}`);
    });
  }

  if (formattedResults.missing.length > 0) {
    console.log('\n⚠️  Missing LinkedIn Profiles:');
    formattedResults.missing.forEach((name, idx) => {
      console.log(`   ${idx + 1}. ${name}`);
    });
  }

  return formattedResults;
}

findGPLinkedInProfiles();
