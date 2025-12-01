import { bdclient } from '@brightdata/sdk';
import fs from 'fs';

const BRIGHT_DATA_API_KEY = "e6f857cb81e08dc2c907514dc53460111fd70d169ad7914b65f2f19f97520a01";

const client = new bdclient({
    apiKey: BRIGHT_DATA_API_KEY,
    logLevel: 'INFO',
    structuredLogging: true,
    verbose: false
});

async function scrapeLinkedInProfiles() {
    try {
        console.log('Starting LinkedIn profile scraping...');
        console.log('Note: SDK handles triggering, polling, and downloading automatically\n');
        
        // The SDK does everything in one call - triggers job, polls, and returns data!
        const profiles = await client.datasets.linkedin.collectProfiles([
            { url: 'https://www.linkedin.com/in/deepak-k-gowda-8b48543/' }
        ]);
        
        console.log('\n✅ Scraping completed successfully!');
        
        // profiles is already an array of profile data (or a single profile object)
        const profileArray = Array.isArray(profiles) ? profiles : [profiles];
        
        console.log(`\n📊 Retrieved ${profileArray.length} profile(s)`);
        console.log('\nProfile data:');
        console.log(JSON.stringify(profileArray, null, 2));
        
        // Save to file for reference
        fs.writeFileSync('./linkedin_profiles.json', JSON.stringify(profileArray, null, 2));
        console.log('\n💾 Saved to: ./linkedin_profiles.json');
        
        return profileArray;
    } catch (err) {
        console.error('❌ Error:', err.message);
        return null;
    }
}

// Run the scraper
scrapeLinkedInProfiles();
