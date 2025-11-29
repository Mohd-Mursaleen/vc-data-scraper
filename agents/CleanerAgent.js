const { JSDOM, VirtualConsole } = require('jsdom');

class CleanerAgent {
  execute(html, url) {
    console.log(`   🧹 Cleaning HTML from: ${url}`);

    const virtualConsole = new VirtualConsole();
    virtualConsole.on("error", () => {});

    const dom = new JSDOM(html, { url, virtualConsole });
    const doc = dom.window.document;

    const title = doc.title || 'Untitled';

    doc.querySelectorAll('svg').forEach(el => el.remove());
    doc.querySelectorAll('script').forEach(el => el.remove());
    doc.querySelectorAll('style').forEach(el => el.remove());
    doc.querySelectorAll('noscript').forEach(el => el.remove());

    const links = this.extractLinks(doc, url);

    const cleanedHtml = doc.body.innerHTML
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/\s+/g, ' ')
      .replace(/>\s+</g, '><')
      .trim();

    const plainText = this.extractText(doc.body);

    console.log(`   ✅ Cleaned: ${title} (${cleanedHtml.length} chars, ${plainText.length} chars text, ${links.length} links)`);

    return {
      title,
      cleanedHtml,
      plainText,
      links,
      cleanedAt: new Date().toISOString()
    };
  }

  extractText(element) {
    const text = element.textContent || '';
    return text
      .replace(/\s+/g, ' ')
      .trim();
  }

  extractLinks(doc, baseUrl) {
    const links = [];
    const seen = new Set();

    doc.querySelectorAll('a[href]').forEach(anchor => {
      const href = anchor.getAttribute('href');
      if (!href) return;

      let absoluteUrl;
      if (href.startsWith('http://') || href.startsWith('https://')) {
        absoluteUrl = href;
      } else if (href.startsWith('/')) {
        const base = new URL(baseUrl);
        absoluteUrl = `${base.protocol}//${base.host}${href}`;
      } else if (href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) {
        return;
      } else {
        return;
      }

      if (!seen.has(absoluteUrl)) {
        seen.add(absoluteUrl);
        links.push({
          url: absoluteUrl,
          text: anchor.textContent.trim().substring(0, 200)
        });
      }
    });

    return links;
  }
}

module.exports = CleanerAgent;
