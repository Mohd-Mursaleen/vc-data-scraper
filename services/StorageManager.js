const fs = require("fs");
const path = require("path");

class StorageManager {
  createDomainStructure(domain) {
    const dir = path.join("output", domain);
    if (!fs.existsSync("output")) fs.mkdirSync("output");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);
  }
  savePage(domain, pageName, data) {
    const dir = path.join("output", domain);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, `${pageName}.json`), JSON.stringify(data, null, 2));
  }
  createScreenshotFolder(domain, pageName) {
    const dir = path.join("output", domain, "screenshots", pageName);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }
  saveMetadata(domain, data) {
    fs.writeFileSync(path.join("output", domain, `crawl_metadata.json`), JSON.stringify(data, null, 2));
  }
  saveLinksReport(domain, report) {
    fs.writeFileSync(path.join("output", domain, `links_report.json`), JSON.stringify(report, null, 2));
  }
  saveStructuredData(domain, pageName, data) {
    const dir = path.join("output", domain, "structured");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${pageName}.json`), JSON.stringify(data, null, 2));
  }
}
module.exports = StorageManager;
