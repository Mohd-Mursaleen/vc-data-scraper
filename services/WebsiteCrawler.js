const { chromium } = require('playwright');
const ContentExtractor = require('../services/ContentExtracter');
const fs = require('fs');
const path = require('path');

class WebsiteCrawler {
  constructor(opts = {}) {
    this.contentExtractor = new ContentExtractor();
    this.headless = opts.headless ?? true;
    this.delay = opts.delay ?? 1200;
    this.priorityKeywords = ['about', 'team', 'contact', 'company', 'fund', 'portfolio'];
    this.maxPagesPerKeyword = 1; // Only hit 1 unique link per keyword
  }
  async initialize() {
    this.browser = await chromium.launch({ headless: this.headless });
    this.context = await this.browser.newContext();
  }
  async close() { if (this.browser) await this.browser.close(); }

  async crawlSite(seedUrl, officialName) {
    const visited = {};
    // Start only with the homepage
    const toVisit = [{ url: seedUrl, label: 'home' }];
    const results = {};
    const foundPerKeyword = {};
    while (toVisit.length) {
      const { url, label } = toVisit.shift();
      if (visited[url]) continue; visited[url] = true;
      const page = await this.context.newPage();
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await page.waitForTimeout(this.delay);
        const html = await page.content();
        const extract = this.contentExtractor.extractPageContent(html);
        results[label] = extract;
        console.log(`   [✓] Scraped "${label}" page at ${url}. Text: ${extract.cleanText.length} chars, LinkedIn links: ${extract.linkedinLinks.length}`);
        // Find internal links, only once per keyword
        const anchors = await page.$$('a[href]');
        for (const a of anchors) {
          let href = await a.getAttribute('href');
          if (!href) continue;
          // Normalize href
          if (href.startsWith('/')) {
            const root = seedUrl.split('/').slice(0, 3).join('/');
            href = root + href;
          } else if (!href.startsWith('http')) {
            // skip mailto:, tel:, anchors etc
            if (!/^mailto:|^tel:|^\#/.test(href)) {
              const root = seedUrl.split('/').slice(0, 3).join('/');
              href = root + '/' + href.replace(/^\/+/,'');
            } else continue;
          }
          // Only visit internal links
          if (!href.startsWith(seedUrl.split('/').slice(0, 3).join('/'))) continue;
          const text = (await a.innerText()).toLowerCase();
          for (const key of this.priorityKeywords) {
            if (
              (href.toLowerCase().includes(key) || text.includes(key)) &&
              (!foundPerKeyword[key] || foundPerKeyword[key].size < this.maxPagesPerKeyword)
            ) {
              foundPerKeyword[key] = foundPerKeyword[key] || new Set();
              if (!foundPerKeyword[key].has(href)) {
                toVisit.push({ url: href, label: key });
                foundPerKeyword[key].add(href);
                console.log(`   [>] Queued "${key}" page: ${href}`);
              }
            }
          }
        }
      } catch (e) {
        results[label] = { error: String(e) };
        console.log(`   [!] Failed to crawl "${label}" page ${url}:`, e.message || e);
      }
      await page.close();
    }
    // Save result
    const outDir = path.join('output', officialName.replace(/\W+/g, '_'));
    fs.mkdirSync(outDir, { recursive: true });
    const outfile = path.join(outDir, 'scraped_content.json');
    fs.writeFileSync(outfile, JSON.stringify(results, null, 2));
    console.log(`   [+] Saved scrape data to ${outfile}`);
    return results;
  }
}
module.exports = WebsiteCrawler;
