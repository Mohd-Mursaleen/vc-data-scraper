const ScraperAgent = require('../agents/ScraperAgent');
const CleanerAgent = require('../agents/CleanerAgent');
const PageAnalyzer = require('../agents/PageAnalyzer');
const GeminiService = require('../services/GeminiService');
const fs = require('fs');
require('dotenv').config();

async function testSmartScraper(url) {
  console.log('🚀 Starting Smart Scraper Test...');
  console.log(`Target URL: ${url}`);

  // 1. Initialize Agents
  const scraper = new ScraperAgent();
  const cleaner = new CleanerAgent();
  const gemini = new GeminiService();
  const analyzer = new PageAnalyzer(gemini);

  try {
    // 2. Scrape
    console.log('\n--- STEP 1: SCRAPING ---');
    const scrapeResult = await scraper.execute(url);
    
    if (!scrapeResult.html) {
      console.error('❌ Scraping failed:', scrapeResult.error);
      return;
    }
    
    // Save rendered HTML for debugging selectors
    fs.writeFileSync('debug_rendered_page.html', scrapeResult.html);
    console.log(`💾 Saved rendered HTML to 'debug_rendered_page.html'`);

    console.log(`✅ Scraped ${scrapeResult.html.length} chars`);

    // 3. Clean
    console.log('\n--- STEP 2: CLEANING ---');
    const cleanResult = cleaner.execute(scrapeResult.html, url);
    console.log(`✅ Cleaned Text: ${cleanResult.plainText.length} chars`);

    // 4. Analyze
    console.log('\n--- STEP 3: ANALYZING ---');
    
    // Save plain text for comparison
    fs.writeFileSync('debug_extracted_text.txt', cleanResult.plainText);
    console.log(`💾 Saved extracted plain text to 'debug_extracted_text.txt'`);

    // Detect type for test (simple heuristic)
    const pageType = url.includes('team') ? 'team' : 'general';
    
    const analysisResult = await analyzer.analyze(cleanResult.plainText, url, pageType);

    // 5. Output Results
    console.log('\n' + '='.repeat(50));
    console.log('📊 FINAL ANALYSIS RESULT');
    console.log('='.repeat(50));
    console.log(JSON.stringify(analysisResult, null, 2));

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await scraper.close();
  }
}

// Get URL from command line arg or use default
const targetUrl = process.argv[2] || 'https://www.ascentcapital.in/team'; // Default to a known team page if none provided

testSmartScraper(targetUrl);
