const fs = require('fs');
const path = require('path');
const ApifyLinkedInScraper = require('../services/ApifyLinkedInScraper');
require('dotenv').config();

async function testApifyLinkedIn() {
  console.log('\n🧪 Testing Apify LinkedIn Scraper...\n');

  const firmSlug = 'ascent-capital';
  const dataDir = path.join('./data/firms', firmSlug);
  
  const linkedInPrioritizedPath = path.join(dataDir, 'linkedin_prioritized.json');

  if (!fs.existsSync(linkedInPrioritizedPath)) {
    console.log('❌ linkedin_prioritized.json not found!');
    console.log('   Run test_link_prioritization.js first.');
    return;
  }

  const linkedInUrls = JSON.parse(fs.readFileSync(linkedInPrioritizedPath, 'utf-8'));
  
  console.log(`📊 Loaded ${linkedInUrls.length} LinkedIn URLs to scrape\n`);

  if (linkedInUrls.length === 0) {
    console.log('⚠️  No LinkedIn URLs to scrape!');
    return;
  }

  if (!process.env.APIFY_API_TOKEN) {
    console.log('❌ APIFY_API_TOKEN not found in .env file!');
    console.log('   Please add your Apify API token to .env:');
    console.log('   APIFY_API_TOKEN=your_token_here');
    return;
  }

  const scraper = new ApifyLinkedInScraper();

  const urls = linkedInUrls.map(link => link.url || link);

  const result = await scraper.scrapeProfiles(urls);

  if (!result.success) {
    console.log(`\n❌ Scraping failed: ${result.message}`);
    return;
  }

  const formattedProfiles = scraper.formatProfiles(result.profiles);
  const insights = scraper.extractInsights(formattedProfiles);

  const outputPath = path.join(dataDir, 'linkedin_scraped_profiles.json');
  fs.writeFileSync(outputPath, JSON.stringify(formattedProfiles, null, 2));

  const insightsPath = path.join(dataDir, 'linkedin_insights.json');
  fs.writeFileSync(insightsPath, JSON.stringify(insights, null, 2));

  console.log(`\n💾 Saved ${formattedProfiles.length} profiles to: ${outputPath}`);
  console.log(`💾 Saved insights to: ${insightsPath}`);

  console.log('\n📊 Profile Summary:');
  formattedProfiles.forEach((profile, idx) => {
    console.log(`\n${idx + 1}. ${profile.name || 'Unknown'}`);
    console.log(`   ${profile.headline || 'No headline'}`);
    console.log(`   ${profile.location || 'No location'}`);
    console.log(`   Connections: ${profile.connections || 'N/A'}`);
  });

  console.log('\n📈 Insights Summary:');
  console.log(`   Companies: ${insights.companies.length}`);
  console.log(`   Schools: ${insights.schools.length}`);
  console.log(`   Unique Locations: ${insights.locations.length}`);
  console.log(`   Top Skills: ${insights.topSkills.slice(0, 5).map(s => s.skill).join(', ')}`);
}

testApifyLinkedIn();

