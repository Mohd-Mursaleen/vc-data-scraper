const cheerio = require("cheerio");

class LinkPrioritizer {
  getPrioritizedLinks(html, baseUrl) {
    const $ = cheerio.load(html);
    const all = [];
    $("a[href]").each((_, el) => {
      const href = $(el).attr("href");
      if (!href) return;
      let url = href.startsWith("http") ? href : new URL(href, baseUrl).href;
      const isExternal = !url.includes((new URL(baseUrl)).hostname);
      // Priority scoring based on context keywords
      let score = 10; // base score
      const text = $(el).text();
      if (/about|team|contact|portfolio|service|product|career|pricing/i.test(url + text)) score += 50;
      all.push({ url, isExternal, text, score, domain: (new URL(url)).hostname });
    });
    return { all };
  }
  findAboutUsPage(links, baseUrl) {
    for (const link of links) {
      if (/about/i.test(link.url) || /about/i.test(link.text)) {
        return link.url;
      }
    }
    return null;
  }
}
module.exports = LinkPrioritizer;
