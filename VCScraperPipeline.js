const fs = require('fs');
const path = require('path');
const GeminiService = require('./services/GeminiService');
const DiscoveryAgent = require('./agents/DiscoveryAgent');
const NewsAgent = require('./agents/NewsAgent');
const ScraperAgent = require('./agents/ScraperAgent');
const CleanerAgent = require('./agents/CleanerAgent');
const PageAnalyzer = require('./agents/PageAnalyzer');
const LinkPrioritizationAgent = require('./agents/LinkPrioritizationAgent');
const BrightDataLinkedInScraper = require('./services/BrightDataLinkedInScraper');
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
    this.pageAnalyzer = new PageAnalyzer(this.gemini);
    this.prioritizer = new LinkPrioritizationAgent(this.gemini);
    this.linkedInScraper = new BrightDataLinkedInScraper();
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

      // PHASE 3: Scrape & Analyze Regular URLs
      console.log('\n🌐 PHASE 3: Scraping & Analyzing Regular Pages');
      const pageAnalyses = [];

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
        
        // Detect page type from URL
        const pageType = this.detectPageType(urlObj.url, cleaned.title);
        
        // Analyze page with PageAnalyzer to extract structured facts
        const analysis = await this.pageAnalyzer.analyze(
          cleaned.plainText,
          urlObj.url,
          pageType
        );

        // Add firm context to analysis
        analysis.firmName = firmRecord.Name;
        analysis.pageId = pageId;
        analysis.pageType = pageType;
        analysis.url = urlObj.url;

        // Save page HTML and analysis
        this.storage.savePage(firmSlug, pageId, scraped.html, cleaned);
        
        // Save page analysis JSON
        const analysisPath = path.join(
          this.storage.getFirmDir(firmSlug),
          'page_analyses',
          `${pageId}_analysis.json`
        );
        fs.mkdirSync(path.dirname(analysisPath), { recursive: true });
        fs.writeFileSync(analysisPath, JSON.stringify(analysis, null, 2));

        // Collect for synthesis (only if relevant)
        if (analysis.is_relevant) {
          pageAnalyses.push(analysis);
        }

        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      console.log(`\n   ✅ Analyzed ${pageAnalyses.length} relevant pages (${regularUrls.length} total scraped)`);

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
        registrationNo: firmRecord['Registration No.'],
        email: firmRecord['E-mail'],
        address: firmRecord.Address,
        validity: firmRecord.Validity,
        // Extract location from address (simple extraction - takes first city mention)
        location: this.extractLocation(firmRecord.Address)
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

      // PHASE 6: Scrape LinkedIn Profiles & Companies
      console.log('\n👤 PHASE 6: Scraping LinkedIn Profiles & Companies');

      let linkedInProfiles = [];
      let linkedInCompanies = [];

      if (highValueLinkedIn.length > 0 && process.env.BRIGHT_DATA_API_KEY) {
        // Split URLs into profiles and companies
        const profileUrls = highValueLinkedIn
          .map(link => link.url)
          .filter(url => !url.includes('/company/') && !url.includes('/school/'));
        
        const companyUrls = highValueLinkedIn
          .map(link => link.url)
          .filter(url => url.includes('/company/') || url.includes('/school/'));

        // 1. Scrape Personal Profiles
        if (profileUrls.length > 0) {
          const linkedInResult = await this.linkedInScraper.scrapeProfiles(profileUrls);

          if (linkedInResult.success) {
            linkedInProfiles = this.linkedInScraper.formatProfiles(linkedInResult.profiles);
            
            const profilesPath = path.join(
              this.storage.getFirmDir(firmSlug),
              'linkedin_scraped_profiles.json'
            );
            fs.writeFileSync(profilesPath, JSON.stringify(linkedInProfiles, null, 2));

            console.log(`   ✅ Scraped ${linkedInProfiles.length} LinkedIn profiles`);
          } else {
            console.log(`   ⚠️  LinkedIn profile scraping failed: ${linkedInResult.message}`);
          }
        } else {
          console.log('   ⚠️  No valid personal profiles to scrape');
        }

        // 2. Scrape Company Pages
        if (companyUrls.length > 0) {
          const companyResult = await this.linkedInScraper.scrapeCompanies(companyUrls);

          if (companyResult.success) {
            linkedInCompanies = this.linkedInScraper.formatCompanyProfiles(companyResult.companies);
            
            const companiesPath = path.join(
              this.storage.getFirmDir(firmSlug),
              'linkedin_scraped_companies.json'
            );
            fs.writeFileSync(companiesPath, JSON.stringify(linkedInCompanies, null, 2));

            console.log(`   ✅ Scraped ${linkedInCompanies.length} LinkedIn company pages`);
          } else {
            console.log(`   ⚠️  LinkedIn company scraping failed: ${companyResult.message}`);
          }
        } else {
          console.log('   ℹ️  No company pages to scrape');
        }

      } else if (!process.env.BRIGHT_DATA_API_KEY) {
        console.log(`   ⚠️  Skipping LinkedIn scraping (no BRIGHT_DATA_API_KEY)`);
      } else {
        console.log(`   ⚠️  No high-value LinkedIn profiles to scrape`);
      }

      // PHASE 7: Synthesize Final Data
      console.log('\n🧬 PHASE 7: Synthesizing Final Report');

      const knowledgeBase = {
        targetRecord: firmRecord,
        pageAnalyses: pageAnalyses,  // Structured JSON facts from each page
        linkedInData: linkedInProfiles,  // Scraped LinkedIn profiles
        linkedInCompanyData: linkedInCompanies // Scraped LinkedIn company pages
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
          analyzedPages: pageAnalyses.length,
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

  /**
   * Detect page type from URL and title for better PageAnalyzer context
   */
  detectPageType(url, title) {
    const urlLower = url.toLowerCase();
    const titleLower = (title || '').toLowerCase();

    // Team/People pages
    if (urlLower.includes('/team') || urlLower.includes('/people') || 
        urlLower.includes('/about-us') || titleLower.includes('team')) {
      return 'team';
    }

    // Portfolio pages
    if (urlLower.includes('/portfolio') || urlLower.includes('/investments') ||
        titleLower.includes('portfolio')) {
      return 'portfolio';
    }

    // Fund/Strategy pages
    if (urlLower.includes('/fund') || urlLower.includes('/strategy') ||
        urlLower.includes('/approach') || titleLower.includes('fund')) {
      return 'fund_info';
    }

    // Contact pages
    if (urlLower.includes('/contact') || titleLower.includes('contact')) {
      return 'contact_info';
    }

    // News/Press pages
    if (urlLower.includes('/news') || urlLower.includes('/press') ||
        urlLower.includes('/blog') || urlLower.includes('/article')) {
      return 'news_deal';
    }

    // Default to general
    return 'general';
  }

  /**
   * Extract location/city from SEBI address field
   * Simple extraction - looks for common Indian city patterns
   */
  extractLocation(address) {
    if (!address) return null;

    // Common Indian cities to look for
    const cities = [
      'MUMBAI', 'DELHI', 'BANGALORE', 'BENGALURU', 'HYDERABAD', 'CHENNAI', 
      'KOLKATA', 'PUNE', 'AHMEDABAD', 'GURGAON', 'GURUGRAM', 'NOIDA',
      'JAIPUR', 'SURAT', 'LUCKNOW', 'KANPUR', 'NAGPUR', 'INDORE',
      'THANE', 'BHOPAL', 'VISAKHAPATNAM', 'PIMPRI', 'PATNA', 'VADODARA',
      'GHAZIABAD', 'LUDHIANA', 'AGRA', 'NASHIK', 'FARIDABAD', 'MEERUT',
      'RAJKOT', 'KALYAN', 'VASAI', 'VARANASI', 'SRINAGAR', 'AURANGABAD'
    ];

    const upperAddress = address.toUpperCase();
    
    for (const city of cities) {
      if (upperAddress.includes(city)) {
        // Return capitalized version
        return city.charAt(0) + city.slice(1).toLowerCase();
      }
    }

    return null;
  }
}

module.exports = VCScraperPipeline;
