const cheerio = require('cheerio');
class ContentExtractor {
  extractPageContent(html) {
    const $ = cheerio.load(html);
    $('script, style, noscript').remove();
    const cleanText = $('body').text().replace(/\s+/g, ' ').trim();
    // All LinkedIn links on the page
    const links = [];
    $('a[href*="linkedin"]').each((_, a) => {
      links.push($(a).attr('href'));
    });
    // Deduplicate
    return { cleanText, linkedinLinks: Array.from(new Set(links)) };
  }
}
module.exports = ContentExtractor;
