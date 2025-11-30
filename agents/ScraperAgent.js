const { chromium } = require('playwright');

class ScraperAgent {
  constructor() {
    this.browser = null;
    this.headless = process.env.HEADLESS !== 'true'; // Default true, can override in .env
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

    } catch (error) {
      // Fallback for timeout
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

    // Wait for content to render
    console.log(`   ⏳ Waiting for content to render...`);
    await page.waitForTimeout(2000);

    // Dismiss cookie consents and modals
    await this.dismissPopups(page);

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

  /**
   * Dismiss common cookie consent popups and modals
   * @param {Page} page - Playwright page object
   */
  async dismissPopups(page) {
    try {
      // Common cookie consent button selectors
      const cookieSelectors = [
        // Generic text-based
        'button:has-text("Accept")',
        'button:has-text("Accept All")',
        'button:has-text("Accept Cookies")',
        'button:has-text("I Accept")',
        'button:has-text("Agree")',
        'button:has-text("OK")',
        'button:has-text("Got it")',
        'button:has-text("Allow")',
        'button:has-text("Allow All")',
        'a:has-text("Accept")',
        
        // Common frameworks and IDs
        '#onetrust-accept-btn-handler',
        '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll',
        '#CybotCookiebotDialogBodyButtonAccept',
        '.cookie-consent-accept',
        '.accept-cookies',
        '[data-testid="cookie-accept"]',
        '[aria-label*="Accept"]',
        '[id*="accept-cookie"]',
        '[class*="cookie-accept"]',
        
        // Close buttons for modals
        '[aria-label="Close"]',
        '[aria-label="Dismiss"]',
        'button:has-text("Close")',
        'button:has-text("×")',
        '.modal-close',
        '.close-button',
        '[class*="close"]'
      ];

      // Try clicking each selector (don't wait if not found)
      for (const selector of cookieSelectors) {
        try {
          const element = await page.$(selector);
          if (element && await element.isVisible()) {
            await element.click({ timeout: 1000 });
            console.log(`   ✓ Dismissed popup using: ${selector}`);
            await page.waitForTimeout(500);
            break; // Stop after first successful click
          }
        } catch (err) {
          // Ignore errors, continue to next selector
        }
      }

      // Also try pressing Escape key to close modals
      try {
        await page.keyboard.press('Escape');
      } catch (err) {
        // Ignore
      }

    } catch (error) {
      // Don't fail scraping if popup dismissal fails
      console.log(`   ⚠️  Could not dismiss popups: ${error.message}`);
    }
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
