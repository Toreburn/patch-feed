import axios from 'axios';
import * as cheerio from 'cheerio';
import VendorPatchFetcher from '../vendor-fetch-template.js';
import { fileURLToPath } from 'url';

class MongoDBPatchFetcher extends VendorPatchFetcher {
  constructor() {
    super('mongodb');
  }

  async fetchPatches() {
    try {
      this.log('Starting MongoDB patch fetch');
      
      // Fetch from MongoDB Security Releases page
      const response = await axios.get('https://www.mongodb.com/docs/manual/release-notes/security/');
      const $ = cheerio.load(response.data);
      
      const sevenDaysAgo = this.getSevenDaysAgo();
      const patches = [];

      // Each security advisory is in a section
      $('.section').each((i, section) => {
        const $section = $(section);
        const titleElem = $section.find('h2, h3').first();
        const title = titleElem.text().trim();
        
        // Look for date in the format "Released: Month DD, YYYY"
        const dateText = $section.find('p').filter((i, el) => {
          return $(el).text().includes('Released:');
        }).first().text();
        
        const dateMatch = dateText.match(/Released:\s+(\w+ \d+,\s+\d{4})/);
        if (!dateMatch) return;
        
        const releaseDate = new Date(dateMatch[1]);
        if (releaseDate < sevenDaysAgo) return;

        // Get description from the content following the title
        let description = '';
        const contentElements = $section.find('p, li');
        contentElements.each((i, el) => {
          if (i < 3) { // Get first 3 elements for description
            description += $(el).text().trim() + ' ';
          }
        });

        patches.push({
          title,
          date: releaseDate.toISOString().split('T')[0],
          severity: this.determineSeverity(description),
          vendor: 'mongodb',
          component: 'MongoDB Server',
          description: description.substring(0, 200) + '...',
          link: 'https://www.mongodb.com/docs/manual/release-notes/security/'
        });
      });

      if (patches.length === 0) {
        this.log('No new patches found in the last 7 days');
      }

      return await this.updatePatchData(patches);
    } catch (error) {
      this.log(`Failed to fetch patches: ${error.message}`, 'ERROR');
      if (error.response) {
        this.log(`Response status: ${error.response.status}`, 'ERROR');
        this.log(`Response data: ${JSON.stringify(error.response.data)}`, 'ERROR');
      }
      throw error;
    }
  }

  determineSeverity(description) {
    const lowercaseDesc = description.toLowerCase();
    if (lowercaseDesc.includes('critical') || 
        lowercaseDesc.includes('remote code execution') ||
        lowercaseDesc.includes('authentication bypass')) {
      return 'CRITICAL';
    } else if (lowercaseDesc.includes('high') || 
               lowercaseDesc.includes('privilege escalation') ||
               lowercaseDesc.includes('unauthorized access')) {
      return 'HIGH';
    } else if (lowercaseDesc.includes('medium') || 
               lowercaseDesc.includes('denial of service') ||
               lowercaseDesc.includes('information disclosure')) {
      return 'MEDIUM';
    } else if (lowercaseDesc.includes('low')) {
      return 'LOW';
    }
    return 'UNKNOWN';
  }
}

// Execute if run directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const fetcher = new MongoDBPatchFetcher();
  fetcher.fetchPatches().catch(console.error);
}

export default MongoDBPatchFetcher;
