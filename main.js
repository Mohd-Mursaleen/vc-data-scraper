const fs = require('fs');
const path = require('path');
const VCScraperPipeline = require('./VCScraperPipeline');
require('dotenv').config();

/**
 * Main orchestrator for batch VC firm processing
 * Reads firms from inputs.json and processes them through the pipeline
 */
class MainOrchestrator {
  constructor() {
    this.pipeline = new VCScraperPipeline();
    this.inputFile = path.join(__dirname, 'inputs.json');
    this.outputCsv = path.join(__dirname, 'results.csv');
    this.results = [];
  }

  /**
   * Load firm records from inputs.json
   */
  loadInputs() {
    try {
      const data = fs.readFileSync(this.inputFile, 'utf-8');
      const firms = JSON.parse(data);
      console.log(`📥 Loaded ${firms.length} firm records from ${this.inputFile}`);
      return firms;
    } catch (error) {
      console.error(`❌ Failed to load inputs.json:`, error.message);
      throw error;
    }
  }

  /**
   * Process all firms through the pipeline
   */
  async processAll() {
    const startTime = Date.now();
    console.log('\n' + '='.repeat(80));
    console.log('🚀 STARTING VC SCRAPER PIPELINE - BATCH PROCESSING');
    console.log('='.repeat(80));

    const firms = this.loadInputs();

    console.log(`\n📊 Processing ${firms.length} firms...\n`);

    for (let i = 0; i < firms.length; i++) {
      const firm = firms[i];
      console.log(`\n[${ i + 1}/${firms.length}] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      
      try {
        const result = await this.pipeline.processFirm(firm);
        
        if (result.success) {
          this.results.push({
            firmRecord: firm,
            synthesizedData: result.synthesizedData,
            stats: result.stats
          });
        } else {
          console.error(`   ❌ Failed to process ${firm.Name}: ${result.error}`);
          this.results.push({
            firmRecord: firm,
            error: result.error,
            synthesizedData: null
          });
        }
      } catch (error) {
        console.error(`   ❌ Exception processing ${firm.Name}:`, error.message);
        this.results.push({
          firmRecord: firm,
          error: error.message,
          synthesizedData: null
        });
      }

      // Delay between firms to avoid rate limiting
      if (i < firms.length - 1) {
        console.log('\n   ⏱️  Waiting 3 seconds before next firm...');
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }

    const duration = ((Date.now() - startTime) / 1000 / 60).toFixed(2);
    
    console.log('\n' + '='.repeat(80));
    console.log('✅ BATCH PROCESSING COMPLETE');
    console.log('='.repeat(80));
    console.log(`⏱️  Total Duration: ${duration} minutes`);
    console.log(`✅ Successful: ${this.results.filter(r => r.synthesizedData).length}`);
    console.log(`❌ Failed: ${this.results.filter(r => !r.synthesizedData).length}`);
    console.log('='.repeat(80));
  }

  /**
   * Convert array fields to pipe-separated strings for CSV
   */
  arrayToString(arr) {
    if (!arr || arr.length === 0) return '';
    return arr.join(' | ');
  }

  /**
   * Convert results to CSV format
   */
  convertToCSV() {
    console.log('\n📝 Converting results to CSV...');

    // Define CSV columns (matching synthesis output + metadata)
    const columns = [
      // Metadata
      'sebi_firm_name',
      'sebi_registration_no',
      'sebi_contact_person',
      'sebi_email',
      'sebi_address',
      'sebi_validity',
      
      // Processing status
      'processing_status',
      'processing_error',
      
      // Statistics
      'stats_regular_urls',
      'stats_linkedin_urls',
      'stats_analyzed_pages',
      'stats_linkedin_profiles',
      'stats_duration_min',
      
      // Synthesized data (16 data points)
      'firm_name',
      'fund_names',
      'fund_sizes',
      'gps',
      'gp_backgrounds',
      'team_size',
      'recent_funding_activity',
      'fund_start_date',
      'firm_start_date',
      'portfolio_companies',
      'past_performance',
      'industry_focus',
      'deal_velocity',
      'avg_cheque_size',
      'cheque_size_pct_round',
      'primary_coinvestors'
    ];

    // Create CSV header
    const header = columns.join(',');

    // Create CSV rows
    const rows = this.results.map(result => {
      const firm = result.firmRecord;
      const data = result.synthesizedData;
      const stats = result.stats || {};
      const error = result.error || '';

      // Escape function for CSV values
      const escape = (value) => {
        if (value === null || value === undefined) return '';
        const str = String(value);
        // Escape quotes and wrap in quotes if contains comma, newline, or quote
        if (str.includes(',') || str.includes('\n') || str.includes('"')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };

      const row = [
        // Metadata
        escape(firm.Name),
        escape(firm['Registration No.']),
        escape(firm['Contact Person']),
        escape(firm['E-mail']),
        escape(firm.Address),
        escape(firm.Validity),
        
        // Processing status
        escape(data ? 'SUCCESS' : 'FAILED'),
        escape(error),
        
        // Statistics
        escape(stats.regularUrls || ''),
        escape(stats.linkedInUrls || ''),
        escape(stats.analyzedPages || ''),
        escape(stats.linkedInProfiles || ''),
        escape(stats.duration || ''),
        
        // Synthesized data
        escape(data?.firm_name || ''),
        escape(this.arrayToString(data?.fund_names || [])),
        escape(this.arrayToString(data?.fund_sizes || [])),
        escape(this.arrayToString(data?.gps || [])),
        escape(data?.gp_backgrounds || ''),
        escape(data?.team_size || ''),
        escape(data?.recent_funding_activity || ''),
        escape(data?.fund_start_date || ''),
        escape(data?.firm_start_date || ''),
        escape(this.arrayToString(data?.portfolio_companies || [])),
        escape(data?.past_performance || ''),
        escape(data?.industry_focus || ''),
        escape(data?.deal_velocity || ''),
        escape(data?.avg_cheque_size || ''),
        escape(data?.cheque_size_pct_round || ''),
        escape(this.arrayToString(data?.primary_coinvestors || []))
      ];

      return row.join(',');
    });

    // Combine header and rows
    const csv = [header, ...rows].join('\n');

    return csv;
  }

  /**
   * Save results to CSV file
   */
  saveCSV() {
    const csv = this.convertToCSV();
    
    try {
      fs.writeFileSync(this.outputCsv, csv, 'utf-8');
      console.log(`✅ Results saved to: ${this.outputCsv}`);
      console.log(`📊 Total records: ${this.results.length}`);
      
      return this.outputCsv;
    } catch (error) {
      console.error(`❌ Failed to save CSV:`, error.message);
      throw error;
    }
  }

  /**
   * Save individual JSON reports for reference
   */
  saveIndividualReports() {
    console.log('\n💾 Saving individual JSON reports...');
    
    const reportsDir = path.join(__dirname, 'data', 'reports');
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }

    this.results.forEach((result, index) => {
      if (result.synthesizedData) {
        const firmName = result.firmRecord.Name.replace(/[^a-z0-9]/gi, '-').toLowerCase();
        const reportPath = path.join(reportsDir, `${firmName}_report.json`);
        
        fs.writeFileSync(reportPath, JSON.stringify({
          sebi_record: result.firmRecord,
          synthesized_data: result.synthesizedData,
          stats: result.stats,
          generated_at: new Date().toISOString()
        }, null, 2));
        
        console.log(`   ✅ Saved: ${firmName}_report.json`);
      }
    });
  }

  /**
   * Main execution flow
   */
  async run() {
    try {
      // Process all firms
      await this.processAll();
      
      // Save results to CSV
      this.saveCSV();
      
      // Save individual JSON reports
      this.saveIndividualReports();
      
      console.log('\n' + '='.repeat(80));
      console.log('🎉 ALL PROCESSING COMPLETE!');
      console.log('='.repeat(80));
      console.log(`📄 CSV Output: ${this.outputCsv}`);
      console.log(`📁 JSON Reports: ./data/reports/`);
      console.log(`📁 Page Data: ./data/firms/`);
      console.log('='.repeat(80) + '\n');
      
    } catch (error) {
      console.error('\n❌ FATAL ERROR:', error);
      process.exit(1);
    }
  }
}

// Run if executed directly
if (require.main === module) {
  const orchestrator = new MainOrchestrator();
  orchestrator.run().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = MainOrchestrator;
