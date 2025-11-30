const { chromium } = require('playwright');

class ScraperAgent {
  constructor() {
    this.browser = null;
    this.headless = false; // Set to true for production, false for debugging
  }

  async init() {
    if (!this.browser) {
      this.browser = await chromium.launch({ 
        headless: this.headless,
        slowMo: this.headless ? 0 : 500
      });
    }
  }

  /**
   * Main execution method
   * @param {string} url - URL to scrape
   */
  async execute(url) {
    console.log(`   🌐 Scraping: ${url}`);

    await this.init();
    const context = await this.browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });

    const page = await context.newPage();
    
    let response;
    let statusCode = 200;

    try {
      response = await page.goto(url, { 
        waitUntil: 'networkidle',
        timeout: 60000 
      });
      statusCode = response.status();

      // Fallback for timeout
    } catch (error) {
      if (error.message.includes('Timeout')) {
        console.log(`   ⚠️  Network idle timeout, falling back to domcontentloaded...`);
        try {
          response = await page.goto(url, { 
            waitUntil: 'domcontentloaded',
            timeout: 30000 
          });
          statusCode = response.status();
        } catch (fallbackError) {
          console.log(`   ❌ Fallback failed: ${fallbackError.message}`);
          await context.close();
          return this.makeErrorResult(url, fallbackError.message);
        }
      } else {
        console.log(`   ❌ Error: ${error.message}`);
        await context.close();
        return this.makeErrorResult(url, error.message);
      }
    }

    console.log(`   ⏳ Waiting for content to render...`);
    await page.waitForTimeout(2000);

    // Get final HTML
    const html = await page.content();
    
    await context.close();

    return {
      url,
      html,
      statusCode,
      scrapedAt: new Date().toISOString()
    };
  }

  makeErrorResult(url, errorMessage) {
    return {
      url,
      html: null,
      statusCode: 0,
      error: errorMessage,
      scrapedAt: new Date().toISOString()
    };
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}

module.exports = ScraperAgent;
