class URLClassifier {
  static classify(urls) {
    const regular = [];
    const linkedin = [];

    urls.forEach(urlObj => {
      const url = urlObj.url || urlObj;
      
      if (this.isLinkedIn(url)) {
        linkedin.push(urlObj);
      } else {
        regular.push(urlObj);
      }
    });

    return { regular, linkedin };
  }

  static isLinkedIn(url) {
    const linkedInPatterns = [
      'linkedin.com/in/',
      'linkedin.com/company/',
      'linkedin.com/pub/'
    ];

    return linkedInPatterns.some(pattern => url.includes(pattern));
  }
}

module.exports = URLClassifier;
