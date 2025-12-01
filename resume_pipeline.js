const fs = require('fs');
const path = require('path');
const VCScraperPipeline = require('./VCScraperPipeline');
const StorageService = require('./services/StorageService');
const GPEnrichmentAgent = require('./agents/GPEnrichmentAgent');
const GeminiService = require('./services/GeminiService');
require('dotenv').config();

/**
 * Resume Pipeline Script
 * Resumes processing for a firm from Phase 6 (LinkedIn Scraping)
 * Uses existing page analyses and prioritized links to avoid re-scraping websites
 */
class ResumePipeline {
  constructor() {
    this.pipeline = new VCScraperPipeline();
    this.storage = new StorageService();
    this.gemini = new GeminiService();
    this.gpEnrichmentAgent = new GPEnrichmentAgent(this.gemini);
    this.inputFile = path.join(__dirname, 'inputs.json');
  }

  loadInputs() {
    try {
      const data = fs.readFileSync(this.inputFile, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      console.error(`❌ Failed to load inputs.json:`, error.message);
      return [];
    }
  }

  async resumeFirm(firmName) {
    console.log('\n' + '='.repeat(80));
    console.log(`🔄 RESUMING PIPELINE FOR: ${firmName}`);
    console.log('='.repeat(80));

    // 1. Find firm record
    const firms = this.loadInputs();
    const firmRecord = firms.find(f => f.Name === firmName);

    if (!firmRecord) {
      console.error(`❌ Firm "${firmName}" not found in inputs.json`);
      return;
    }

    const firmSlug = this.storage.getFirmSlug(firmRecord.Name);
    const firmDir = this.storage.getFirmDir(firmSlug);

    if (!fs.existsSync(firmDir)) {
      console.error(`❌ Data directory not found for ${firmName}. Cannot resume.`);
      console.error(`   Expected: ${firmDir}`);
      return;
    }

    // 2. Load Existing Data
    console.log('\n📂 Loading existing data...');

    // Load Page Analyses
    const pageAnalysesDir = path.join(firmDir, 'page_analyses');
    const pageAnalyses = [];
    if (fs.existsSync(pageAnalysesDir)) {
      const files = fs.readdirSync(pageAnalysesDir);
      files.forEach(file => {
        const content = fs.readFileSync(path.join(pageAnalysesDir, file), 'utf-8');
        pageAnalyses.push(JSON.parse(content));
      });
    }
    console.log(`   ✅ Loaded ${pageAnalyses.length} page analyses`);

    // Load Prioritized LinkedIn Links
    const prioritizedPath = path.join(firmDir, 'linkedin_prioritized.json');
    let highValueLinkedIn = [];
    if (fs.existsSync(prioritizedPath)) {
      highValueLinkedIn = JSON.parse(fs.readFileSync(prioritizedPath, 'utf-8'));
      console.log(`   ✅ Loaded ${highValueLinkedIn.length} prioritized LinkedIn links`);
    } else {
      console.log(`   ⚠️  No prioritized LinkedIn links found.`);
    }

    // 3. Resume Phase 6: Scrape LinkedIn Profiles & Companies
    console.log('\n👤 PHASE 6: Scraping LinkedIn Profiles & Companies (RESUMED)');
    
    let linkedInProfiles = [];
    let linkedInCompanies = [];
    
    // Check if we already have profiles
    const profilesPath = path.join(firmDir, 'linkedin_scraped_profiles.json');
    const companiesPath = path.join(firmDir, 'linkedin_scraped_companies.json');
    
    // Load existing profiles if available
    if (fs.existsSync(profilesPath)) {
      linkedInProfiles = JSON.parse(fs.readFileSync(profilesPath, 'utf-8'));
      console.log(`   ✅ Found ${linkedInProfiles.length} existing profiles.`);
    }

    // Load existing companies if available
    if (fs.existsSync(companiesPath)) {
      linkedInCompanies = JSON.parse(fs.readFileSync(companiesPath, 'utf-8'));
      console.log(`   ✅ Found ${linkedInCompanies.length} existing company pages.`);
    }

    if (highValueLinkedIn.length > 0 && process.env.BRIGHT_DATA_API_KEY) {
      // Split URLs
      const profileUrls = highValueLinkedIn
        .map(link => link.url)
        .filter(url => !url.includes('/company/') && !url.includes('/school/'));
      
      const companyUrls = highValueLinkedIn
        .map(link => link.url)
        .filter(url => url.includes('/company/') || url.includes('/school/'));

      console.log(`   👤 Profiles to scrape: ${profileUrls.length}`);
      console.log(`   🏢 Companies to scrape: ${companyUrls.length}`);

      // Build parallel scraping promises (only for missing data)
      const scrapePromises = [];
      
      if (linkedInProfiles.length === 0 && profileUrls.length > 0) {
        scrapePromises.push(
          this.pipeline.linkedInScraper.scrapeProfiles(profileUrls)
            .then(result => ({ type: 'profiles', result }))
        );
      }
      
      if (linkedInCompanies.length === 0 && companyUrls.length > 0) {
        scrapePromises.push(
          this.pipeline.linkedInScraper.scrapeCompanies(companyUrls)
            .then(result => ({ type: 'companies', result }))
        );
      }

      // Execute parallel scraping if needed
      if (scrapePromises.length > 0) {
        const results = await Promise.all(scrapePromises);

        // Process results
        results.forEach(({ type, result }) => {
          if (type === 'profiles') {
            if (result.success) {
              linkedInProfiles = this.pipeline.linkedInScraper.formatProfiles(result.profiles);
              fs.writeFileSync(profilesPath, JSON.stringify(linkedInProfiles, null, 2));
              console.log(`   ✅ Scraped ${linkedInProfiles.length} LinkedIn profiles`);
            } else {
              console.log(`   ⚠️  LinkedIn profile scraping failed: ${result.message}`);
            }
          } else if (type === 'companies') {
            if (result.success) {
              linkedInCompanies = this.pipeline.linkedInScraper.formatCompanyProfiles(result.companies);
              fs.writeFileSync(companiesPath, JSON.stringify(linkedInCompanies, null, 2));
              console.log(`   ✅ Scraped ${linkedInCompanies.length} LinkedIn company pages`);
            } else {
              console.log(`   ⚠️  LinkedIn company scraping failed: ${result.message}`);
            }
          }
        });
      }

    } else {
      console.log(`   ⚠️  Skipping LinkedIn scraping (no key or no links)`);
    }

    // 4. Resume Phase 7: GP Discovery & Enrichment
    console.log('\n🕵️  PHASE 7: GP Discovery & Enrichment (RESUMED)');
    
    let gpProfiles = [];
    const gpProfilesPath = path.join(firmDir, 'linkedin_gp_profiles.json');
    
    if (fs.existsSync(gpProfilesPath)) {
      gpProfiles = JSON.parse(fs.readFileSync(gpProfilesPath, 'utf-8'));
      console.log(`   ✅ Found ${gpProfiles.length} existing GP profiles.`);
    } else {
      // Discover GP names
      const discoveredGPs = this.pipeline.gpDiscovery.discoverGPs({
        pageAnalyses,
        linkedInProfiles,
        targetRecord: firmRecord
      });
      
      // Validate GP names: filter out invalid/empty names
      const gpNames = discoveredGPs.filter(name => {
        if (!name || typeof name !== 'string') return false;
        const trimmed = name.trim();
        if (trimmed.length < 3) return false;
        if (trimmed.length > 100) return false;
        if (!/[a-zA-Z]/.test(trimmed)) return false;
        return true;
      });

      console.log(`   🔍 Discovered ${discoveredGPs.length} potential GPs`);
      console.log(`   ✅ Validated ${gpNames.length} valid GP names`);
      
      if (gpNames.length > 0 && process.env.BRIGHT_DATA_API_KEY) {
        // Defensive: filter out profiles without names to prevent crashes
        const existingNames = new Set(
          linkedInProfiles
            .filter(p => p && p.name)
            .map(p => p.name.toLowerCase())
        );
        const targetGPs = gpNames.filter(gp => !existingNames.has(gp.toLowerCase()));

        if (targetGPs.length > 0) {
          console.log(`   🎯 Searching for ${targetGPs.length} new GPs...`);
          gpProfiles = await this.gpEnrichmentAgent.execute(targetGPs, firmRecord.Name);
          
          if (gpProfiles.length > 0) {
            fs.writeFileSync(gpProfilesPath, JSON.stringify(gpProfiles, null, 2));
            console.log(`   ✅ Enriched ${gpProfiles.length} GP profiles`);
          }
        } else {
          console.log('   ✅ All discovered GPs already have profiles.');
        }
      }
    }

    // 5. Resume Phase 8: Single Comprehensive Synthesis
    console.log('\n🧬 PHASE 8: Synthesizing Final Report (RESUMED)');

    const knowledgeBase = {
      targetRecord: firmRecord,
      pageAnalyses: pageAnalyses,
      linkedInData: [...linkedInProfiles, ...gpProfiles], // Include GP profiles
      linkedInCompanyData: linkedInCompanies
    };

    let synthesizedData = null;
    const finalOutputPath = path.join(firmDir, 'final_report.json');

    try {
      synthesizedData = await this.pipeline.synthesizer.execute(knowledgeBase);
      fs.writeFileSync(finalOutputPath, JSON.stringify(synthesizedData, null, 2));

      console.log('\n' + '='.repeat(80));
      console.log('✅ RESUME COMPLETE');
      console.log('='.repeat(80));
      console.log(`💾 Final Report: ${finalOutputPath}`);
      
    } catch (error) {
      console.error(`❌ Synthesis failed:`, error.message);
    }
  }
}

// Run if executed directly
if (require.main === module) {
  const firmName = process.argv[2];
  if (!firmName) {
    console.log('Usage: node resume_pipeline.js "Firm Name"');
    console.log('Example: node resume_pipeline.js "021 Capital Trust"');
    process.exit(1);
  }

  const resumer = new ResumePipeline();
  resumer.resumeFirm(firmName).catch(console.error);
}

module.exports = ResumePipeline;
