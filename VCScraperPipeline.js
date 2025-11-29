const fs = require('fs');
const path = require('path');
const GeminiService = require('./services/GeminiService');
const DiscoveryAgent = require('./agents/DiscoveryAgent');
const NewsAgent = require('./agents/NewsAgent');
const ScraperAgent = require('./agents/ScraperAgent');
const CleanerAgent = require('./agents/CleanerAgent');
const LinkPrioritizationAgent = require('./agents/LinkPrioritizationAgent');
const ApifyLinkedInScraper = require('./services/ApifyLinkedInScraper');
const SynthesisAgent = require('./agents/SynthesisAgent');
const StorageService = require('./services/StorageService');
const URLClassifier = require('./utils/URLClassifier');
require('dotenv').config();

/**
 * Full VC Scraper Pipeline
 * Processes one VC firm record at a time through the complete workflow
 */
class VCScraperPipeline {
  constructor() {
    this.gemini = new GeminiService();
    this.discoveryAgent = new DiscoveryAgent(this.gemini);
    this.newsAgent = new NewsAgent(this.gemini);
    this.scraper = new ScraperAgent();
    this.cleaner = new CleanerAgent();
    this.prioritizer = new LinkPrioritizationAgent(this.gemini);
    this.linkedInScraper = new ApifyLinkedInScraper();
    this.synthesizer = new SynthesisAgent(this.gemini);
    this.storage = new StorageService();
  }

  async processFirm(firmRecord) {
    console.log('\n' + '='.repeat(80));
    console.log(`🏢 Processing: ${firmRecord.Name}`);
    console.log('='.repeat(80));

    const firmSlug = this.storage.getFirmSlug(firmRecord.Name);
    const startTime = Date.now();

    try {
      // PHASE 1: Discovery & News
      console.log('\n📍 PHASE 1: URL Discovery');
      const discoveryResult = await this.discoveryAgent.execute(firmRecord);
      const newsResult = await this.newsAgent.execute(firmRecord);

      const allUrls = [
        ...(discoveryResult.urls || []),
        ...(newsResult.urls || [])
      ];

      console.log(`   ✅ Discovered ${allUrls.length} URLs`);

      // PHASE 2: Classify URLs
      console.log('\n🔍 PHASE 2: URL Classification');
      const { regular: regularUrls, linkedin: linkedInUrls } = URLClassifier.classify(allUrls);
      
      console.log(`   📎 Regular URLs: ${regularUrls.length}`);
      console.log(`   🔗 LinkedIn URLs: ${linkedInUrls.length}`);

      this.storage.saveLinkedInQueue(firmSlug, linkedInUrls);

      // PHASE 3: Scrape & Extract Regular URLs
      console.log('\n🌐 PHASE 3: Scraping Regular Pages');
      const plainTexts = [];

      for (let i = 0; i < regularUrls.length; i++) {
        const urlObj = regularUrls[i];
        const pageId = `page_${String(i + 1).padStart(3, '0')}`;

        console.log(`\n   [${i + 1}/${regularUrls.length}] ${urlObj.url}`);

        const scraped = await this.scraper.execute(urlObj.url);

        if (!scraped.html || scraped.statusCode !== 200) {
          console.log(`   ⚠️  Skipped (${scraped.error || 'HTTP ' + scraped.statusCode})`);
          continue;
        }

        const cleaned = this.cleaner.execute(scraped.html, urlObj.url);
        
        this.storage.savePage(firmSlug, pageId, scraped.html, cleaned);
        
        plainTexts.push(cleaned.plainText);

        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      console.log(`\n   ✅ Scraped ${plainTexts.length} pages successfully`);

      await this.scraper.close();

      // PHASE 4: Extract Additional LinkedIn URLs from Scraped Content
      console.log('\n🔗 PHASE 4: Extracting Additional LinkedIn URLs');
      
      const extractedLinksDir = path.join(this.storage.getFirmDir(firmSlug), 'extracted_links');
      const allExtractedLinks = [];

      if (fs.existsSync(extractedLinksDir)) {
        const files = fs.readdirSync(extractedLinksDir);
        files.forEach(file => {
          const content = fs.readFileSync(path.join(extractedLinksDir, file), 'utf-8');
          const links = JSON.parse(content);
          allExtractedLinks.push(...links);
        });
      }

      const discoveredLinkedIn = allExtractedLinks.filter(link => 
        URLClassifier.isLinkedIn(link.url)
      );

      const allLinkedInUrls = [...linkedInUrls, ...discoveredLinkedIn];
      console.log(`   📌 Total LinkedIn URLs: ${allLinkedInUrls.length}`);

      // PHASE 5: Prioritize LinkedIn URLs
      console.log('\n⭐ PHASE 5: Prioritizing LinkedIn URLs');

      const firmInfo = {
        contactPerson: firmRecord['Contact Person'],
        registrationNo: firmRecord['Registration No.']
      };

      const prioritizedLinkedIn = await this.prioritizer.execute(
        allLinkedInUrls,
        firmRecord.Name,
        firmInfo
      );

      const highValueLinkedIn = prioritizedLinkedIn.filter(link => link.importance >= 60);

      const linkedInPrioritizedPath = path.join(
        this.storage.getFirmDir(firmSlug),
        'linkedin_prioritized.json'
      );
      fs.writeFileSync(linkedInPrioritizedPath, JSON.stringify(highValueLinkedIn, null, 2));

      console.log(`   ✅ Prioritized: ${highValueLinkedIn.length} high-value profiles (score >= 60)`);

      // PHASE 6: Scrape LinkedIn Profiles
      console.log('\n👤 PHASE 6: Scraping LinkedIn Profiles');

      let linkedInProfiles = [];

      if (highValueLinkedIn.length > 0 && process.env.APIFY_API_TOKEN) {
        const urls = highValueLinkedIn.map(link => link.url);

        const linkedInResult = await this.linkedInScraper.scrapeProfiles(urls);

        if (linkedInResult.success) {
          linkedInProfiles = this.linkedInScraper.formatProfiles(linkedInResult.profiles);
          
          const profilesPath = path.join(
            this.storage.getFirmDir(firmSlug),
            'linkedin_scraped_profiles.json'
          );
          fs.writeFileSync(profilesPath, JSON.stringify(linkedInProfiles, null, 2));

          console.log(`   ✅ Scraped ${linkedInProfiles.length} LinkedIn profiles`);
        } else {
          console.log(`   ⚠️  LinkedIn scraping failed: ${linkedInResult.message}`);
        }
      } else if (!process.env.APIFY_API_TOKEN) {
        console.log(`   ⚠️  Skipping LinkedIn scraping (no APIFY_API_TOKEN)`);
      } else {
        console.log(`   ⚠️  No high-value LinkedIn profiles to scrape`);
      }

      // PHASE 7: Synthesize Final Data
      console.log('\n🧬 PHASE 7: Synthesizing Final Report');

      const knowledgeBase = {
        targetRecord: firmRecord,
        discovery: discoveryResult,
        websiteContent: plainTexts.join('\n\n--- PAGE BREAK ---\n\n'),
        newsData: newsResult,
        linkedInData: linkedInProfiles
      };

      const synthesizedData = await this.synthesizer.execute(knowledgeBase);

      const finalOutputPath = path.join(
        this.storage.getFirmDir(firmSlug),
        'final_report.json'
      );
      fs.writeFileSync(finalOutputPath, JSON.stringify(synthesizedData, null, 2));

      const duration = ((Date.now() - startTime) / 1000 / 60).toFixed(2);

      console.log('\n' + '='.repeat(80));
      console.log('✅ PIPELINE COMPLETE');
      console.log('='.repeat(80));
      console.log(`📊 Firm: ${synthesizedData.firm_name || firmRecord.Name}`);
      console.log(`📁 Data: ./data/firms/${firmSlug}/`);
      console.log(`⏱️  Duration: ${duration} minutes`);
      console.log(`💾 Final Report: ${finalOutputPath}`);
      console.log('='.repeat(80));

      return {
        success: true,
        firmSlug,
        synthesizedData,
        stats: {
          regularUrls: regularUrls.length,
          linkedInUrls: allLinkedInUrls.length,
          scrapedPages: plainTexts.length,
          linkedInProfiles: linkedInProfiles.length,
          duration: duration
        }
      };

    } catch (error) {
      console.error(`\n❌ Pipeline failed for ${firmRecord.Name}:`, error.message);
      
      return {
        success: false,
        firmSlug,
        error: error.message
      };
    }
  }

  async processBatch(firmRecords) {
    console.log(`\n🚀 Starting batch processing for ${firmRecords.length} firms\n`);

    const results = [];

    for (let i = 0; i < firmRecords.length; i++) {
      console.log(`\n[${ i + 1}/${firmRecords.length}]`);
      
      const result = await this.processFirm(firmRecords[i]);
      results.push(result);

      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    const successCount = results.filter(r => r.success).length;
    const failedCount = results.filter(r => !r.success).length;

    console.log('\n' + '='.repeat(80));
    console.log('📊 BATCH PROCESSING COMPLETE');
    console.log('='.repeat(80));
    console.log(`✅ Successful: ${successCount}`);
    console.log(`❌ Failed: ${failedCount}`);
    console.log(`📁 Total Processed: ${results.length}`);
    console.log('='.repeat(80));

    return results;
  }
}

module.exports = VCScraperPipeline;
