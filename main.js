const fs = require('fs');
const path = require('path');
const GoogleSearchService = require('./services/GoogleSearchService');
const WebsiteCrawler = require('./services/WebsiteCrawler');

const sebiRecords = JSON.parse(fs.readFileSync('sebi_records.json', 'utf-8'));
const google = new GoogleSearchService();
const crawler = new WebsiteCrawler();

(async () => {
  await crawler.initialize();
  let processed = 0;
  for (const rec of sebiRecords) {
    processed++;
    const label = (rec.Name || rec["Registration No."] || "AIF").replace(/\W+/g, '_');
    // 1. Google search for homepage
    const query = `${rec["Registration No."]} ${rec.Name}`;
    console.log(`\n[${processed}/${sebiRecords.length}] Searching: ${query}`);
    const gResults = await google.search(query);
    if (!gResults[0] || !gResults[0].link) {
      console.log(`   [!] Google search gave no results, skipping.`);
      continue;
    }
    const homepageUrl = gResults[0].link;
    let officialName = '';
    try {
      const urlObj = new URL(homepageUrl);
      // Try to get a clean title (site label) or fallback to SEBI name
      officialName = gResults[0].title?.trim() || urlObj.hostname.replace(/^www\./, '');
    } catch {
      officialName = rec.Name;
    }
    console.log(`   [i] Using homepage: ${homepageUrl}`);
    console.log(`   [i] Official name: ${officialName}`);

    // 2. Crawl root + priority pages, saving only clean text & LinkedIn links
    try {
      const crawlResult = await crawler.crawlSite(homepageUrl, officialName);
      // Log what was scraped
      const outDir = path.join('output', officialName.replace(/\W+/g, '_'));
      const savedFile = path.join(outDir, 'scraped_content.json');
      if (fs.existsSync(savedFile)) {
        console.log(`   [+] Scraped & saved: ${savedFile}`);
        if (crawlResult.home) {
          console.log(`   [✓] Home page, words: ${crawlResult.home.cleanText.length}`);
        }
        const keys = Object.keys(crawlResult || {}).filter(k=>k!=='home');
        for (const k of keys) {
          if (crawlResult[k] && crawlResult[k].cleanText)
            console.log(`   [✓] '${k}' page, words: ${crawlResult[k].cleanText.length}`);
          if (crawlResult[k] && crawlResult[k].linkedinLinks?.length)
            console.log(`   [✓] '${k}' page, LinkedIn links:`, crawlResult[k].linkedinLinks);
        }
      } else {
        console.log(`   [!] File not saved for some reason!`);
      }
    } catch (err) {
      console.log(`   [!] Crawl failed for ${homepageUrl}:`, err.message || err);
    }
  }
  await crawler.close();
  console.log('=== All records processed. ===');
})();
