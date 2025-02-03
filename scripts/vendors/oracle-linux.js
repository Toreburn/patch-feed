import axios from 'axios';
import * as cheerio from 'cheerio';
import VendorPatchFetcher from '../vendor-fetch-template.js';
import { fileURLToPath } from 'url';

class OracleLinuxPatchFetcher extends VendorPatchFetcher {
  constructor() {
    super('oracle-linux');
  }

  async fetchPatches() {
    try {
      this.log('Starting Oracle Linux patch fetch');
      
      // Fetch from Oracle Linux Errata feed
      const response = await axios.get('https://linux.oracle.com/security/');
      const $ = cheerio.load(response.data);
      
      const sevenDaysAgo = this.getSevenDaysAgo();
      const patches = [];

      // Each security advisory is in a table row
      $('table tr').each((i, row) => {
        if (i === 0) return; // Skip header row
        
        const $cols = $(row).find('td');
        if ($cols.length < 4) return;

        const dateText = $cols.eq(0).text().trim();
        const advisory = $cols.eq(1).text().trim();
        const description = $cols.eq(2).text().trim();
        const severity = $cols.eq(3).text().trim();
        const link = 'https://linux.oracle.com' + $cols.eq(1).find('a').attr('href');
        
        const pubDate = new Date(dateText);
        
        if (pubDate >= sevenDaysAgo) {
          patches.push({
            title: `Oracle Linux Security Advisory ${advisory}`,
            date: pubDate.toISOString().split('T')[0],
            severity: severity.toUpperCase(),
            vendor: 'oracle-linux',
            component: 'Oracle Linux',
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
  const fetcher = new OracleLinuxPatchFetcher();
  fetcher.fetchPatches().catch(console.error);
}

export default OracleLinuxPatchFetcher;
