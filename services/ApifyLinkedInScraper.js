const { ApifyClient } = require("apify-client");
require("dotenv").config();
/**
 * LinkedIn Scraper using Apify service
 * Replaces Playwright-based scraping with Apify API
 */
class ApifyLinkedInScraper {
  constructor() {
    this.client = new ApifyClient({
      token: process.env.APIFY_API_TOKEN,
    });
    this.actorId = "supreme_coder/linkedin-profile-scraper";
  }

  /**
   * Scrape LinkedIn profiles using Apify
   * @param {Array<string>} urls - Array of LinkedIn profile URLs
   * @returns {Object} Scraped profile data
   */
  async scrapeProfiles(urls) {
    console.log(`🔗 Scraping ${urls.length} LinkedIn profile(s) via Apify...`);

    try {
      // Prepare input for Apify actor
      const input = {
        urls: urls.map((url) => ({ url })),
        "findContacts.contactCompassToken": "",
        "scrapeCompany": false,
      };

      console.log(`   ⏳ Running Apify actor...`);

      // Run the Actor and wait for it to finish
      const run = await this.client.actor(this.actorId).call(input);

      console.log(`   ✅ Actor completed: ${run.id}`);
      console.log(`   💾 Dataset: https://console.apify.com/storage/datasets/${run.defaultDatasetId}`);

      // Fetch results from the dataset
      const { items } = await this.client.dataset(run.defaultDatasetId).listItems();

      if (!items || items.length === 0) {
        console.log(`   ⚠️  No items found in dataset`);
        return {
          success: false,
          profiles: [],
          message: "No data returned from Apify",
        };
      }

      console.log(`   ✅ Retrieved ${items.length} profile(s)`);

      return {
        success: true,
        profiles: items,
        runId: run.id,
        datasetId: run.defaultDatasetId,
        totalProfiles: items.length,
      };
    } catch (error) {
      console.error(`   ❌ Apify scraping failed:`, error.message);
      throw new Error(`Apify LinkedIn scraping failed: ${error.message}`);
    }
  }

  /**
   * Format profile data for consistent response structure
   * @param {Array} profiles - Raw Apify profile data
   * @returns {Array} Formatted profile data
   */
  formatProfiles(profiles) {
    return profiles.map((profile) => ({
      url: profile.url || profile.linkedInUrl,
      name: profile.fullName || profile.name,
      headline: profile.headline,
      location: profile.location,
      about: profile.about || profile.summary,
      experience: profile.experience || [],
      education: profile.education || [],
      skills: profile.skills || [],
      connections: profile.connectionsCount,
      followers: profile.followersCount,
      profilePicture: profile.profilePicture || profile.photoUrl,
      contactInfo: {
        email: profile.email,
        phone: profile.phone,
        twitter: profile.twitter,
        websites: profile.websites || [],
      },
      raw: profile, // Keep full raw data for reference
    }));
  }

  /**
   * Extract key information from profiles
   * @param {Array} profiles - Formatted profile data
   * @returns {Object} Extracted insights
   */
  extractInsights(profiles) {
    const insights = {
      totalProfiles: profiles.length,
      companies: new Set(),
      schools: new Set(),
      locations: new Set(),
      topSkills: {},
      emails: [],
      websites: [],
    };

    profiles.forEach((profile) => {
      // Collect locations
      if (profile.location) {
        insights.locations.add(profile.location);
      }

      // Collect companies from experience
      if (profile.experience && Array.isArray(profile.experience)) {
        profile.experience.forEach((exp) => {
          if (exp.company || exp.companyName) {
            insights.companies.add(exp.company || exp.companyName);
          }
        });
      }

      // Collect schools from education
      if (profile.education && Array.isArray(profile.education)) {
        profile.education.forEach((edu) => {
          if (edu.school || edu.schoolName) {
            insights.schools.add(edu.school || edu.schoolName);
          }
        });
      }

      // Collect skills
      if (profile.skills && Array.isArray(profile.skills)) {
        profile.skills.forEach((skill) => {
          const skillName = typeof skill === "string" ? skill : skill.name;
          if (skillName) {
            insights.topSkills[skillName] = (insights.topSkills[skillName] || 0) + 1;
          }
        });
      }

      // Collect contact info
      if (profile.contactInfo) {
        if (profile.contactInfo.email) {
          insights.emails.push(profile.contactInfo.email);
        }
        if (profile.contactInfo.websites) {
          insights.websites.push(...profile.contactInfo.websites);
        }
      }
    });

    // Convert sets to arrays and sort skills
    return {
      totalProfiles: insights.totalProfiles,
      companies: Array.from(insights.companies),
      schools: Array.from(insights.schools),
      locations: Array.from(insights.locations),
      topSkills: Object.entries(insights.topSkills)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .map(([skill, count]) => ({ skill, count })),
      emails: insights.emails,
      websites: insights.websites,
    };
  }
}

module.exports = ApifyLinkedInScraper;
