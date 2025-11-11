const { chromium } = require("playwright");
const { scrapeSEBIRecords } = require("./services/sebiScraper");
const GoogleSearchService = require("./services/GoogleSearchService");
const WebsiteCrawler = require("./services/WebsiteCrawler");
// Configuration
const MAX_RECORDS = 100;
const DELAY_BETWEEN_VC = 1500;

(async () => {
  // Launch browser once for efficiency!
  const browser = await chromium.launch({ headless: false }); // Enable screenshots
  const google = new GoogleSearchService();
  const crawler = new WebsiteCrawler({ headless: false, maxPagesPerDomain: 8 });

  await crawler.initialize();

  // 1. Scrape VC records from SEBI
  const sebiRecords = await scrapeSEBIRecords(browser, MAX_RECORDS);

  for (const [i, record] of sebiRecords.entries()) {
    console.log(`\n=== [${i + 1}/${sebiRecords.length}] ${record.name} ${record.registrationNo} ===`);
    let vcWebsite = null;

    // 2. Google for VC homepage
    const query = `${record.registrationNo} ${record.name} official website`;
    const gResults = await google.search(query, 1);
    if (gResults[0]?.link) vcWebsite = gResults[0].link;
    record.websiteUrl = vcWebsite;

    // 3. Crawl VC website extensively
    if (vcWebsite) {
      const domain = (new URL(vcWebsite)).hostname.replace(/^www\./, "");
      try {
        const crawlResult = await crawler.crawlSite(vcWebsite, domain);
        record.crawlResult = crawlResult; // Save all crawl details per VC
      } catch (err) {
        record.crawlResult = { error: err.message };
      }
    } else {
      record.crawlResult = { error: "No website found" };
    }
    await crawler.delay(DELAY_BETWEEN_VC);
  }

  // Save results
  const fs = await import("fs");
  if (!fs.existsSync("output")) fs.mkdirSync("output");
  fs.writeFileSync("output/full_results.json", JSON.stringify(sebiRecords, null, 2));
  console.log("Full crawl complete. Results in output/full_results.json");

  await crawler.close();
  await browser.close();
})();
