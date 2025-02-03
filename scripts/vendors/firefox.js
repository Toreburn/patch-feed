import axios from 'axios';
import * as cheerio from 'cheerio';
import VendorPatchFetcher from '../vendor-fetch-template.js';
import { fileURLToPath } from 'url';

class FirefoxPatchFetcher extends VendorPatchFetcher {
  constructor() {
    super('firefox');
  }

  async fetchPatches() {
    try {
      this.log('Starting Firefox patch fetch');
      
      // Fetch from Mozilla Security Advisories
      const response = await axios.get('https://www.mozilla.org/en-US/security/advisories/');
      const $ = cheerio.load(response.data);
      
      const sevenDaysAgo = this.getSevenDaysAgo();
      const patches = [];

      // Process each advisory
      $('.advisory-list li').each((i, item) => {
        const $item = $(item);
        const title = $item.find('a').text().trim();
        const dateStr = $item.find('time').attr('datetime');
        const description = $item.find('.desc').text().trim();
        const link = 'https://www.mozilla.org' + $item.find('a').attr('href');
        
        const releaseDate = new Date(dateStr);
        
        // Only include Firefox-related advisories from last 7 days
        if (releaseDate >= sevenDaysAgo && title.toLowerCase().includes('firefox')) {
          // Determine severity based on content
          let severity = 'UNKNOWN';
          const contentLower = description.toLowerCase();
          if (contentLower.includes('critical')) severity = 'CRITICAL';
          else if (contentLower.includes('high')) severity = 'HIGH';
          else if (contentLower.includes('moderate')) severity = 'MEDIUM';
          else if (contentLower.includes('low')) severity = 'LOW';
          
          patches.push({
            title,
            date: releaseDate.toISOString().split('T')[0],
            severity,
            vendor: 'firefox',
            component: 'Firefox Browser',
            description: description.substring(0, 200) + '...',
            link
          });
        }
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
}

// Execute if run directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const fetcher = new FirefoxPatchFetcher();
  fetcher.fetchPatches().catch(console.error);
}

export default FirefoxPatchFetcher;
