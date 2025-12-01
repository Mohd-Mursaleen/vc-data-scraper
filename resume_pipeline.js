const fs = require('fs');
const path = require('path');
const VCScraperPipeline = require('./VCScraperPipeline');
const StorageService = require('./services/StorageService');
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

      // Scrape Profiles (if not already done)
      if (linkedInProfiles.length === 0 && profileUrls.length > 0) {
        const linkedInResult = await this.pipeline.linkedInScraper.scrapeProfiles(profileUrls);

        if (linkedInResult.success) {
          linkedInProfiles = this.pipeline.linkedInScraper.formatProfiles(linkedInResult.profiles);
          fs.writeFileSync(profilesPath, JSON.stringify(linkedInProfiles, null, 2));
          console.log(`   ✅ Scraped ${linkedInProfiles.length} LinkedIn profiles`);
        } else {
          console.log(`   ⚠️  LinkedIn profile scraping failed: ${linkedInResult.message}`);
        }
      } else if (linkedInProfiles.length > 0) {
        // Already loaded above
      } else {
        console.log('   ⚠️  No valid personal profiles to scrape');
      }

      // Scrape Companies (if not already done)
      if (linkedInCompanies.length === 0 && companyUrls.length > 0) {
        const companyResult = await this.pipeline.linkedInScraper.scrapeCompanies(companyUrls);

        if (companyResult.success) {
          linkedInCompanies = this.pipeline.linkedInScraper.formatCompanyProfiles(companyResult.companies);
          fs.writeFileSync(companiesPath, JSON.stringify(linkedInCompanies, null, 2));
          console.log(`   ✅ Scraped ${linkedInCompanies.length} LinkedIn company pages`);
        } else {
          console.log(`   ⚠️  LinkedIn company scraping failed: ${companyResult.message}`);
        }
      } else if (linkedInCompanies.length > 0) {
        // Already loaded above
      } else {
        console.log('   ℹ️  No company pages to scrape');
      }

    } else {
      console.log(`   ⚠️  Skipping LinkedIn scraping (no key or no links)`);
    }

    // 4. Resume Phase 7: Synthesis
    console.log('\n🧬 PHASE 7: Synthesizing Final Report (RESUMED)');

    const knowledgeBase = {
      targetRecord: firmRecord,
      pageAnalyses: pageAnalyses,
      linkedInData: linkedInProfiles,
      linkedInCompanyData: linkedInCompanies
    };

    try {
      const synthesizedData = await this.pipeline.synthesizer.execute(knowledgeBase);

      const finalOutputPath = path.join(firmDir, 'final_report.json');
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
