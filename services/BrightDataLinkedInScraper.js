const { bdclient } = require('@brightdata/sdk');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

/**
 * LinkedIn Scraper using Bright Data SDK
 * Replaces Apify-based scraping with Bright Data API
 */
class BrightDataLinkedInScraper {
  constructor() {
    this.client = new bdclient({
      apiKey: process.env.BRIGHT_DATA_API_KEY,
      logLevel: 'INFO',
      structuredLogging: true,
      verbose: false
    });
  }

  /**
   * Scrape LinkedIn profiles using Bright Data
   * @param {Array<string>} urls - Array of LinkedIn profile URLs
   * @returns {Object} Scraped profile data
   */
  async scrapeProfiles(urls) {
    console.log(`🔗 Scraping ${urls.length} LinkedIn profile(s) via Bright Data...`);

    const maxRetries = 3;
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 1) {
          const backoffTime = Math.pow(2, attempt - 1) * 1000; // Exponential backoff: 2s, 4s, 8s
          console.log(`   🔄 Retry attempt ${attempt}/${maxRetries} (waiting ${backoffTime/1000}s)...`);
          await new Promise(resolve => setTimeout(resolve, backoffTime));
        }

        console.log(`   ⏳ Starting Bright Data scraping job (attempt ${attempt}/${maxRetries})...`);
        console.log(`   ℹ️  SDK handles triggering, polling, and downloading automatically`);

        // The SDK does everything in one call - triggers job, polls, and returns data!
        const profiles = await this.client.datasets.linkedin.collectProfiles(
          urls.map(url => ({ url }))
        );

        // profiles is already the data (could be array or single object)
        const profileArray = Array.isArray(profiles) ? profiles : [profiles];

        if (!profileArray || profileArray.length === 0) {
          console.log(`   ⚠️  No profiles found in response`);
          return {
            success: false,
            profiles: [],
            message: "No data returned from Bright Data",
          };
        }

        console.log(`   ✅ Retrieved ${profileArray.length} profile(s)`);

        return {
          success: true,
          profiles: profileArray,
          totalProfiles: profileArray.length,
        };
      } catch (error) {
        lastError = error;
        console.error(`   ❌ Attempt ${attempt} failed:`, error.message);
        
        // Don't retry on final attempt
        if (attempt === maxRetries) {
          console.error(`   ❌ All ${maxRetries} attempts failed for profile scraping`);
          return {
            success: false,
            profiles: [],
            message: `Bright Data scraping failed after ${maxRetries} attempts: ${error.message}`
          };
        }
      }
    }
  }

  /**
   * Scrape LinkedIn company profiles using Bright Data
   * @param {Array<string>} urls - Array of LinkedIn company URLs
   * @returns {Object} Scraped company data
   */
  async scrapeCompanies(urls) {
    console.log(`🏢 Scraping ${urls.length} LinkedIn company page(s) via Bright Data...`);

    const maxRetries = 3;
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 1) {
          const backoffTime = Math.pow(2, attempt - 1) * 1000; // Exponential backoff: 2s, 4s, 8s
          console.log(`   🔄 Retry attempt ${attempt}/${maxRetries} (waiting ${backoffTime/1000}s)...`);
          await new Promise(resolve => setTimeout(resolve, backoffTime));
        }

        console.log(`   ⏳ Starting Bright Data company scraping job (attempt ${attempt}/${maxRetries})...`);
        
        const companies = await this.client.datasets.linkedin.collectCompanies(
          urls.map(url => ({ url }))
        );

        const companyArray = Array.isArray(companies) ? companies : [companies];

        if (!companyArray || companyArray.length === 0) {
          console.log(`   ⚠️  No company data found in response`);
          return {
            success: false,
            companies: [],
            message: "No data returned from Bright Data",
          };
        }

        console.log(`   ✅ Retrieved ${companyArray.length} company profile(s)`);

        return {
          success: true,
          companies: companyArray,
          totalCompanies: companyArray.length,
        };
      } catch (error) {
        lastError = error;
        console.error(`   ❌ Attempt ${attempt} failed:`, error.message);
        
        // Don't retry on final attempt
        if (attempt === maxRetries) {
          console.error(`   ❌ All ${maxRetries} attempts failed for company scraping`);
          return {
            success: false,
            companies: [],
            message: `Bright Data company scraping failed after ${maxRetries} attempts: ${error.message}`
          };
        }
      }
    }
  }

  /**
   * Format company data for consistent response structure
   * @param {Array} companies - Raw Bright Data company data
   * @returns {Array} Formatted company data
   */
  formatCompanyProfiles(companies) {
    return companies.map((company) => ({
      url: company.url || company.linkedin_url,
      name: company.name || company.company_name,
      description: company.description || company.about,
      website: company.website || company.company_website,
      industry: company.industry,
      companySize: company.company_size || company.employees_count,
      headquarters: company.headquarters || company.location,
      founded: company.founded || company.founded_year,
      specialties: company.specialties,
      followers: company.followers || company.followers_count,
      logo: company.logo || company.profile_photo,
      raw: company // Keep full raw data for reference
    }));
  }

  /**
   * Format profile data for consistent response structure
   * @param {Array} profiles - Raw Bright Data profile data
   * @returns {Array} Formatted profile data
   */
  formatProfiles(profiles) {
    return profiles.map((profile) => ({
      url: profile.url || profile.input_url || profile.linkedInUrl,
      name: profile.name || profile.fullName,
      headline: profile.headline,
      location: profile.location || profile.city,
      about: profile.about,
      experience: profile.experience || [],
      education: profile.education || [],
      skills: profile.skills || [],
      connections: profile.connections,
      followers: profile.followers,
      profilePicture: profile.avatar || profile.profilePicture || profile.photoUrl,
      contactInfo: {
        email: profile.email,
        phone: profile.phone,
        twitter: profile.twitter,
        websites: profile.websites || profile.bio_links || [],
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
          if (edu.school || edu.schoolName || edu.title) {
            insights.schools.add(edu.school || edu.schoolName || edu.title);
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

module.exports = BrightDataLinkedInScraper;
