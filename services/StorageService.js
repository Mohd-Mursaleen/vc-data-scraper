const fs = require('fs');
const path = require('path');

class StorageService {
  constructor(baseDir = './data') {
    this.baseDir = baseDir;
  }

  getFirmSlug(firmName) {
    return firmName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  getFirmDir(firmSlug) {
    return path.join(this.baseDir, 'firms', firmSlug);
  }

  ensureDir(dirPath) {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  savePage(firmSlug, pageId, rawHtml, cleanedData) {
    const firmDir = this.getFirmDir(firmSlug);
    
    this.ensureDir(path.join(firmDir, 'raw_pages'));
    this.ensureDir(path.join(firmDir, 'cleaned_pages'));
    this.ensureDir(path.join(firmDir, 'plain_text'));
    this.ensureDir(path.join(firmDir, 'extracted_links'));

    if (rawHtml) {
      fs.writeFileSync(
        path.join(firmDir, 'raw_pages', `${pageId}.html`),
        rawHtml
      );
    }

    if (cleanedData) {
      fs.writeFileSync(
        path.join(firmDir, 'cleaned_pages', `${pageId}.html`),
        cleanedData.cleanedHtml
      );

      if (cleanedData.plainText) {
        fs.writeFileSync(
          path.join(firmDir, 'plain_text', `${pageId}.txt`),
          cleanedData.plainText
        );
      }

      if (cleanedData.links && cleanedData.links.length > 0) {
        fs.writeFileSync(
          path.join(firmDir, 'extracted_links', `${pageId}.json`),
          JSON.stringify(cleanedData.links, null, 2)
        );
      }
    }

    console.log(`   💾 Saved page ${pageId} for ${firmSlug}`);
  }

  saveLinkedInQueue(firmSlug, linkedInUrls) {
    const firmDir = this.getFirmDir(firmSlug);
    this.ensureDir(firmDir);

    fs.writeFileSync(
      path.join(firmDir, 'linkedin_queue.json'),
      JSON.stringify(linkedInUrls, null, 2)
    );

    console.log(`   💾 Saved ${linkedInUrls.length} LinkedIn URLs for ${firmSlug}`);
  }

  loadExtractedData(firmSlug) {
    const extractedDir = path.join(this.getFirmDir(firmSlug), 'extracted_data');
    
    if (!fs.existsSync(extractedDir)) {
      return [];
    }

    const files = fs.readdirSync(extractedDir);
    return files.map(file => {
      const content = fs.readFileSync(path.join(extractedDir, file), 'utf-8');
      return JSON.parse(content);
    });
  }

  saveAggregatedData(firmSlug, aggregatedData) {
    const firmDir = this.getFirmDir(firmSlug);
    this.ensureDir(firmDir);

    fs.writeFileSync(
      path.join(firmDir, 'aggregated_data.json'),
      JSON.stringify(aggregatedData, null, 2)
    );

    console.log(`   💾 Saved aggregated data for ${firmSlug}`);
  }
}

module.exports = StorageService;
