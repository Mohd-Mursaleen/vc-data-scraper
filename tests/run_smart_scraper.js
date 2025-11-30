const fs = require('fs');
const ScraperAgent = require('../agents/ScraperAgent');
const CleanerAgent = require('../agents/CleanerAgent');
const StorageService = require('../services/StorageService');
const URLClassifier = require('../utils/URLClassifier');
require('dotenv').config();

async function runSmartScraper(researchOutputPath) {
  console.log('\n🚀 Starting Smart Scraper...\n');

  const researchData = JSON.parse(fs.readFileSync(researchOutputPath, 'utf-8'));
  
  const scraper = new ScraperAgent();
  const cleaner = new CleanerAgent();
  const storage = new StorageService();

  const firmName = 'Ascent Capital';
  const firmSlug = storage.getFirmSlug(firmName);

  console.log(`📊 Processing: ${firmName}`);
  console.log(`📁 Slug: ${firmSlug}\n`);

  const allUrls = [
    ...(researchData.discovery?.urls || []),
    ...(researchData.news?.urls || [])
  ];

  console.log(`📋 Total URLs: ${allUrls.length}\n`);

  const { regular, linkedin } = URLClassifier.classify(allUrls);

  console.log(`✅ Regular URLs: ${regular.length}`);
  console.log(`🔗 LinkedIn URLs: ${linkedin.length}\n`);

  if (linkedin.length > 0) {
    storage.saveLinkedInQueue(firmSlug, linkedin);
  }

  console.log('🌐 Processing Regular URLs...\n');

  const allDiscoveredLinks = [];

  for (let i = 0; i < regular.length; i++) {
    const urlObj = regular[i];
    const pageId = `page_${String(i + 1).padStart(3, '0')}`;

    console.log(`\n[${i + 1}/${regular.length}] Processing: ${urlObj.url}`);
    console.log(`   Context: ${urlObj.context}`);
    console.log(`   Importance: ${urlObj.importance}`);

    const scraped = await scraper.execute(urlObj.url);
    
    if (!scraped.html) {
      console.log(`   ❌ Failed to scrape (${scraped.error || 'unknown error'}), skipping...`);
      continue;
    }

    if (scraped.statusCode !== 200) {
      console.log(`   ⚠️  HTTP ${scraped.statusCode}, skipping...`);
      continue;
    }

    const cleaned = cleaner.execute(scraped.html, urlObj.url);

    storage.savePage(
      firmSlug,
      pageId,
      scraped.html,
      cleaned
    );

    if (cleaned.links && cleaned.links.length > 0) {
      allDiscoveredLinks.push(...cleaned.links);
    }

    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  await scraper.close();

  console.log('\n\n📊 SUMMARY');
  console.log('='.repeat(50));
  console.log(`✅ Processed: ${regular.length} pages`);
  console.log(`🔗 LinkedIn URLs queued: ${linkedin.length}`);
  console.log(`🔍 Total discovered links: ${allDiscoveredLinks.length}`);

  const discoveredLinkedIn = allDiscoveredLinks.filter(link => 
    URLClassifier.isLinkedIn(link.url)
  );
  
  if (discoveredLinkedIn.length > 0) {
    console.log(`   📌 Discovered LinkedIn profiles: ${discoveredLinkedIn.length}`);
    
    const allLinkedInUrls = [...linkedin, ...discoveredLinkedIn];
    storage.saveLinkedInQueue(firmSlug, allLinkedInUrls);
  }

  console.log(`\n✅ Complete! Data saved to: ./data/firms/${firmSlug}/`);
}

const researchOutputPath = process.argv[2] || './research_output.json';

runSmartScraper(researchOutputPath);
