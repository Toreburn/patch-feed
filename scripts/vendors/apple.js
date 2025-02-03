import axios from 'axios';
import * as cheerio from 'cheerio';
import VendorPatchFetcher from '../vendor-fetch-template.js';
import { fileURLToPath } from 'url';

class ApplePatchFetcher extends VendorPatchFetcher {
  constructor() {
    super('apple');
  }

  async fetchPatches() {
    try {
      this.log('Starting Apple patch fetch');
      
      // Fetch from Apple Security Updates page
      const response = await axios.get('https://support.apple.com/en-us/HT201222');
      const $ = cheerio.load(response.data);
      
      const sevenDaysAgo = this.getSevenDaysAgo();
      const patches = [];

      // Apple's security page lists updates in a table
      $('.table-simple tr').each((i, row) => {
        if (i === 0) return; // Skip header row
        
        const $cols = $(row).find('td');
        if ($cols.length < 3) return;
        
        const dateStr = $cols.eq(0).text().trim();
        const title = $cols.eq(1).text().trim();
        const description = $cols.eq(2).text().trim();
        const link = 'https://support.apple.com' + $cols.eq(1).find('a').attr('href');
        
        const releaseDate = new Date(dateStr);
        if (releaseDate >= sevenDaysAgo) {
          patches.push({
            title,
            date: releaseDate.toISOString().split('T')[0],
            severity: 'HIGH', // Apple doesn't typically specify severity levels
            vendor: 'apple',
            component: title.split(' for ')[1] || 'Multiple Products',
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
  const fetcher = new ApplePatchFetcher();
  fetcher.fetchPatches().catch(console.error);
}

export default ApplePatchFetcher;
