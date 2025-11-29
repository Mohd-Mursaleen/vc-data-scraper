const fs = require('fs');
const VCScraperPipeline = require('./VCScraperPipeline');
require('dotenv').config();

async function runFullPipeline() {
  console.log('\n🎯 VC Scraper - Full Pipeline Test\n');

  // Load sample record (or you can load from sebi_records.json)
  const sampleRecord = {
    "Name": "Ascent Capital",
    "Contact Person": "Manjunath Kallapur",
    "Registration No.": "IN/VC/11/0086"
  };

  const pipeline = new VCScraperPipeline();

  // Process single firm
  const result = await pipeline.processFirm(sampleRecord);

  if (result.success) {
    console.log('\n✅ Pipeline executed successfully!');
    console.log(`\n📊 Stats:`);
    console.log(`   Regular URLs scraped: ${result.stats.regul arUrls}`);
    console.log(`   LinkedIn URLs found: ${result.stats.linkedInUrls}`);
    console.log(`   Pages scraped: ${result.stats.scrapedPages}`);
    console.log(`   LinkedIn profiles: ${result.stats.linkedInProfiles}`);
    console.log(`   Duration: ${result.stats.duration} minutes`);
  } else {
    console.log('\n❌ Pipeline failed:', result.error);
  }
}

// To process multiple firms from sebi_records.json:
async function runBatchPipeline() {
  console.log('\n🎯 VC Scraper - Batch Pipeline\n');

  // Load your SEBI records
  const sebiRecords = JSON.parse(fs.readFileSync('./sebi_records.json', 'utf-8'));
  
  // Process first 5 firms as a test
  const batchRecords = sebiRecords.slice(0, 5);

  const pipeline = new VCScraperPipeline();
  const results = await pipeline.processBatch(batchRecords);

  // Save batch results
  fs.writeFileSync('./batch_results.json', JSON.stringify(results, null, 2));
  console.log('\n💾 Batch results saved to: batch_results.json');
}

// Run single firm test
runFullPipeline();

// Uncomment to run batch processing:
// runBatchPipeline();
