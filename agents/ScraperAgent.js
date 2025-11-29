const { chromium } = require('playwright');

class ScraperAgent {
  constructor() {
    this.browser = null;
    this.headless = false;
  }

  async init() {
    if (!this.browser) {
      this.browser = await chromium.launch({ 
        headless: this.headless,
        slowMo: this.headless ? 0 : 500
      });
    }
  }

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
          return {
            url,
            html: null,
            statusCode: 0,
            error: fallbackError.message,
            scrapedAt: new Date().toISOString()
          };
        }
      } else {
        console.log(`   ❌ Error: ${error.message}`);
        await context.close();
        return {
          url,
          html: null,
          statusCode: 0,
          error: error.message,
          scrapedAt: new Date().toISOString()
        };
      }
    }

    console.log(`   ⏳ Waiting for content to render...`);
    await page.waitForTimeout(2000);

    await this.clickDialogButtons(page);

    const html = await page.content();

    await context.close();

    return {
      url,
      html,
      statusCode,
      scrapedAt: new Date().toISOString()
    };
  }

  async clickDialogButtons(page) {
    const dialogSelectors = [
      'button:has-text("Know More")',
      'button:has-text("Read More")',
      'a:has-text("Know More")',
      'a:has-text("Read More")',
      '[data-toggle="modal"]',
      '.modal-trigger'
    ];

    for (const selector of dialogSelectors) {
      const buttons = await page.locator(selector).all();
      
      if (buttons.length > 0) {
        console.log(`   🖱️  Found ${buttons.length} "${selector}" buttons, clicking...`);
        
        for (const button of buttons) {
          await button.click({ timeout: 1000 }).catch(() => {});
          await page.waitForTimeout(500);
        }
      }
    }
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}

module.exports = ScraperAgent;
