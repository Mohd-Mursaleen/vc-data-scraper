class GPDiscoveryService {
  /**
   * Discover GP names from available data WITHOUT full synthesis
   * @param {Object} params
   * @param {Array} params.pageAnalyses - Page facts from CleanerAgent
   * @param {Array} params.linkedInProfiles - Scraped LinkedIn profiles
   * @param {Object} params.targetRecord - SEBI registration data
   * @returns {Array<string>} GP names
   */
  discoverGPs({ pageAnalyses, linkedInProfiles, targetRecord }) {
    console.log('\n🔍 [GP Discovery Service] Discovering GP names...');
    
    const gpNames = new Set();
    
    // 1. From SEBI contact person (most reliable)
    if (targetRecord['Contact Person']) {
      const contactPerson = targetRecord['Contact Person'].trim();
      gpNames.add(contactPerson);
      console.log(`   📋 SEBI Contact: ${contactPerson}`);
    }
    
    // 2. From page analyses (team_member facts)
    let teamFactsCount = 0;
    pageAnalyses?.forEach(analysis => {
      analysis.facts?.forEach(fact => {
        if (fact.category === 'team_member') {
          const name = this.extractNameFromFact(fact.fact);
          if (name) {
            gpNames.add(name);
            teamFactsCount++;
          }
        }
      });
    });
    
    if (teamFactsCount > 0) {
      console.log(`   👥 From team facts: ${teamFactsCount} names`);
    }
    
    // 3. From LinkedIn profiles with "Partner" or "GP" titles
    let linkedInPartners = 0;
    linkedInProfiles?.forEach(profile => {
      const headline = profile.headline?.toLowerCase() || '';
      const isPartner = headline.includes('partner') || 
                       headline.includes(' gp') ||
                       headline.includes('general partner') ||
                       headline.includes('managing director') ||
                       headline.includes('founder');
      
      if (isPartner && profile.name) {
        gpNames.add(profile.name);
        linkedInPartners++;
      }
    });
    
    if (linkedInPartners > 0) {
      console.log(`   💼 From LinkedIn partners: ${linkedInPartners} names`);
    }
    
    const gpArray = Array.from(gpNames).filter(name => name && name.length > 0);
    console.log(`   ✅ Total discovered: ${gpArray.length} unique GPs`);
    
    return gpArray;
  }
  
  /**
   * Extract person name from a fact string
   * @param {string} fact - Fact text like "John Doe is Managing Partner"
   * @returns {string|null} Extracted name or null
   */
  extractNameFromFact(fact) {
    // Pattern 1: "John Doe is Managing Partner"
    // Pattern 2: "John Doe, Partner"
    // Pattern 3: "Managing Partner: John Doe"
    
    // Try to find a capitalized name (First Last or First Middle Last)
    const namePattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})\b/;
    const match = fact.match(namePattern);
    
    if (match) {
      const name = match[1];
      // Validate it's not just a generic word
      const invalidNames = ['Managing Partner', 'General Partner', 'Partner', 'Founder', 'CEO', 'Director'];
      if (!invalidNames.includes(name)) {
        return name;
      }
    }
    
    return null;
  }
}

module.exports = GPDiscoveryService;
