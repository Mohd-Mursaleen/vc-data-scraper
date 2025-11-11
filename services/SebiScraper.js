const fs = require('fs');
const { chromium } = require('playwright');
/**
 * Scrape ALL SEBI AIF records and save to JSON.
 * @param outFile Path for JSON output (default: 'sebi_records.json')
 * @param maxPages Max pages to scrape (-1 = all)
 * @param delayMs Delay between AJAX paginations (default 1500ms)
 */
async function scrapeSEBIRecordsToJson(outFile = 'sebi_records.json', maxPages = -1, delayMs = 1500) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const url = "https://www.sebi.gov.in/sebiweb/other/OtherAction.do?doRecognisedFpi=yes&intmId=16";
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 35000 });

  // Click Show All Records
  await page.click('text=Show All Records');
  await page.waitForSelector('.fixed-table-body.card-table .card-table-left', { timeout: 20000 });

  let allRecords = [];
  let currentPage = 1;

  const getCardsOnPage = async () => {
    return await page.$$eval('.fixed-table-body.card-table .card-table-left', (pages) => {
      return pages.flatMap(pageDiv => {
        const cards = [];
        let card = {};
        let lastLabel = "";
        pageDiv.querySelectorAll('.card-view').forEach(div => {
          const title = div.querySelector('.title span')?.textContent?.trim();
          const value = div.querySelector('.value span, .value .varun-text')?.textContent?.trim();
          if (title && title.toLowerCase() === "name") {
            if (Object.keys(card).length > 0) cards.push(card);
            card = { Name: value || "" };
            lastLabel = title;
          } else if (title) {
            card[title] = value || "";
            lastLabel = title;
          } else if (value && lastLabel) {
            card[lastLabel] += " " + value;
          }
        });
        if (Object.keys(card).length > 0) cards.push(card);
        return cards;
      });
    });
  };

  while (true) {
    console.log(`Scraping SEBI page ${currentPage} ...`);
    const records = await getCardsOnPage();
    allRecords.push(...records);

    // Find Next button: if not found, break
    const nextBtn = await page.$('li a[title="Next"]');
    if (!nextBtn || (maxPages > 0 && currentPage >= maxPages)) break;

    await nextBtn.click();
    await page.waitForTimeout(delayMs); // AJAX load
    currentPage += 1;
  }

  await browser.close();
  fs.writeFileSync(outFile, JSON.stringify(allRecords, null, 2));
  console.log(`Saved ${allRecords.length} SEBI records to ${outFile}`);
  return allRecords;
}
module.exports = { scrapeSEBIRecordsToJson };
