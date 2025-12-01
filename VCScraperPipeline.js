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
const GPEnrichmentAgent = require('./agents/GPEnrichmentAgent');
const GPDiscoveryService = require('./services/GPDiscoveryService');
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
    this.gpDiscovery = new GPDiscoveryService();
    this.gpEnrichmentAgent = new GPEnrichmentAgent(this.gemini);
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

        await new Promise(resolve => setTimeout(resolve, 2000));
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

        console.log(`   👤 Profiles to scrape: ${profileUrls.length}`);
        console.log(`   🏢 Companies to scrape: ${companyUrls.length}`);

        // Scrape profiles and companies in PARALLEL
        const scrapePromises = [];
        
        if (profileUrls.length > 0) {
          scrapePromises.push(
            this.linkedInScraper.scrapeProfiles(profileUrls)
              .then(result => ({ type: 'profiles', result }))
          );
        }
        
        if (companyUrls.length > 0) {
          scrapePromises.push(
            this.linkedInScraper.scrapeCompanies(companyUrls)
              .then(result => ({ type: 'companies', result }))
          );
        }

        // Wait for both to complete
        const results = await Promise.all(scrapePromises);

        // Process results
        results.forEach(({ type, result }) => {
          if (type === 'profiles') {
            if (result.success) {
              linkedInProfiles = this.linkedInScraper.formatProfiles(result.profiles);
              
              const profilesPath = path.join(
                this.storage.getFirmDir(firmSlug),
                'linkedin_scraped_profiles.json'
              );
              fs.writeFileSync(profilesPath, JSON.stringify(linkedInProfiles, null, 2));

              console.log(`   ✅ Scraped ${linkedInProfiles.length} LinkedIn profiles`);
            } else {
              console.log(`   ⚠️  LinkedIn profile scraping failed: ${result.message}`);
            }
          } else if (type === 'companies') {
            if (result.success) {
              linkedInCompanies = this.linkedInScraper.formatCompanyProfiles(result.companies);
              
              const companiesPath = path.join(
                this.storage.getFirmDir(firmSlug),
                'linkedin_scraped_companies.json'
              );
              fs.writeFileSync(companiesPath, JSON.stringify(linkedInCompanies, null, 2));

              console.log(`   ✅ Scraped ${linkedInCompanies.length} LinkedIn company pages`);
            } else {
              console.log(`   ⚠️  LinkedIn company scraping failed: ${result.message}`);
            }
          }
        });

      } else if (!process.env.BRIGHT_DATA_API_KEY) {
        console.log(`   ⚠️  Skipping LinkedIn scraping (no BRIGHT_DATA_API_KEY)`);
      } else {
        console.log(`   ⚠️  No high-value LinkedIn profiles to scrape`);
      }

      // PHASE 7: GP Discovery & Enrichment
      console.log('\n🕵️  PHASE 7: GP Discovery & Enrichment');
      
      // Discover GP names from available data (no synthesis needed)
      const discoveredGPs = this.gpDiscovery.discoverGPs({
        pageAnalyses,
        linkedInProfiles,
        targetRecord: firmRecord
      });

      // Validate GP names: filter out invalid/empty names
      const gpNames = discoveredGPs.filter(name => {
        if (!name || typeof name !== 'string') return false;
        const trimmed = name.trim();
        if (trimmed.length < 3) return false; // Too short
        if (trimmed.length > 100) return false; // Suspiciously long
        if (!/[a-zA-Z]/.test(trimmed)) return false; // Must contain letters
        return true;
      });

      console.log(`   🔍 Discovered ${discoveredGPs.length} potential GPs`);
      console.log(`   ✅ Validated ${gpNames.length} valid GP names`);

      let gpProfiles = [];
      if (gpNames.length > 0 && process.env.BRIGHT_DATA_API_KEY) {
        // Filter out GPs we already have profiles for
        // Defensive: filter out profiles without names to prevent crashes
        const existingNames = new Set(
          linkedInProfiles
            .filter(p => p && p.name)  // Only profiles with names
            .map(p => p.name.toLowerCase())
        );
        const targetGPs = gpNames.filter(gp => !existingNames.has(gp.toLowerCase()));

        if (targetGPs.length > 0) {
          console.log(`   🎯 Searching for ${targetGPs.length} new GPs...`);
          gpProfiles = await this.gpEnrichmentAgent.execute(targetGPs, firmRecord.Name);
          
          if (gpProfiles.length > 0) {
            const gpProfilesPath = path.join(
              this.storage.getFirmDir(firmSlug),
              'linkedin_gp_profiles.json'
            );
            fs.writeFileSync(gpProfilesPath, JSON.stringify(gpProfiles, null, 2));
            console.log(`   ✅ Enriched ${gpProfiles.length} GP profiles`);
          }
        } else {
          console.log('   ✅ All discovered GPs already have profiles.');
        }
      } else if (!process.env.BRIGHT_DATA_API_KEY) {
        console.log('   ⚠️  Skipping GP enrichment (no BRIGHT_DATA_API_KEY)');
      }

      // PHASE 8: Single Comprehensive Synthesis (with ALL data including GPs)
      console.log('\n🧬 PHASE 8: Synthesizing Final Report');

      const knowledgeBase = {
        targetRecord: firmRecord,
        pageAnalyses: pageAnalyses,
        linkedInData: [...linkedInProfiles, ...gpProfiles], // Include GP profiles
        linkedInCompanyData: linkedInCompanies
      };

      const synthesizedData = await this.synthesizer.execute(knowledgeBase);

      // Validate synthesis output
      console.log('   🔍 Validating synthesis output...');
      const validationErrors = [];

      // Check required fields
      if (!synthesizedData.firm_name || synthesizedData.firm_name.trim().length === 0) {
        validationErrors.push('Missing or empty firm_name');
      }
      if (!Array.isArray(synthesizedData.fund_names)) {
        validationErrors.push('fund_names is not an array');
      }
      if (!Array.isArray(synthesizedData.gps)) {
        validationErrors.push('gps is not an array');
      }
      if (!Array.isArray(synthesizedData.portfolio_companies)) {
        validationErrors.push('portfolio_companies is not an array');
      }

      // Warn about validation errors but don't fail
      if (validationErrors.length > 0) {
        console.log(`   ⚠️  Validation warnings: ${validationErrors.join(', ')}`);
        console.log('   ℹ️  Proceeding with potentially incomplete data');
      } else {
        console.log('   ✅ Synthesis output validated');
      }

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
          linkedInProfiles: linkedInProfiles.length + gpProfiles.length,
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
