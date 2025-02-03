import axios from 'axios';
import * as cheerio from 'cheerio';
import VendorPatchFetcher from '../vendor-fetch-template.js';
import { fileURLToPath } from 'url';

class CiscoPatchFetcher extends VendorPatchFetcher {
  constructor() {
    super('cisco');
  }

  getSeverityFromText(text) {
    const lower = text.toLowerCase();
    if (lower.includes('critical')) return 'CRITICAL';
    if (lower.includes('high')) return 'HIGH';
    if (lower.includes('medium')) return 'MEDIUM';
    if (lower.includes('low')) return 'LOW';
    return 'UNKNOWN';
  }

  async fetchPatches() {
    try {
      this.log('Starting Cisco patch fetch');
      
      // Fetch from Cisco Security Advisories
      const response = await axios.get('https://tools.cisco.com/security/center/publicationListing.x');
      const $ = cheerio.load(response.data);
      
      const sevenDaysAgo = this.getSevenDaysAgo();
      const patches = [];

      // Process each advisory
      $('.ccms-publication-table tbody tr').each((i, row) => {
        const $cols = $(row).find('td');
        if ($cols.length < 4) return;
        
        const dateStr = $cols.eq(0).text().trim();
        const title = $cols.eq(1).text().trim();
        const severity = this.getSeverityFromText($cols.eq(2).text().trim());
        const link = 'https://tools.cisco.com' + $cols.eq(1).find('a').attr('href');
        
        const releaseDate = new Date(dateStr);
        if (releaseDate >= sevenDaysAgo) {
          patches.push({
            title,
            date: releaseDate.toISOString().split('T')[0],
            severity,
            vendor: 'cisco',
            component: title.split(' ')[0], // Usually the product name
            description: title,
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
  const fetcher = new CiscoPatchFetcher();
  fetcher.fetchPatches().catch(console.error);
}

export default CiscoPatchFetcher;
