import axios from 'axios';
import * as cheerio from 'cheerio';
import VendorPatchFetcher from '../vendor-fetch-template.js';
import { fileURLToPath } from 'url';

class VMwarePatchFetcher extends VendorPatchFetcher {
  constructor() {
    super('vmware');
  }

  getSeverityFromText(text) {
    const lower = text.toLowerCase();
    if (lower.includes('critical')) return 'CRITICAL';
    if (lower.includes('important')) return 'HIGH';
    if (lower.includes('moderate')) return 'MEDIUM';
    if (lower.includes('low')) return 'LOW';
    return 'UNKNOWN';
  }

  async fetchPatches() {
    try {
      this.log('Starting VMware patch fetch');
      
      // Fetch from VMware Security Advisories
      const response = await axios.get('https://www.vmware.com/security/advisories.html');
      const $ = cheerio.load(response.data);
      
      const sevenDaysAgo = this.getSevenDaysAgo();
      const patches = [];

      // Process each advisory
      $('.security-advisory-list tr').each((i, row) => {
        if (i === 0) return; // Skip header row
        
        const $cols = $(row).find('td');
        if ($cols.length < 4) return;
        
        const dateStr = $cols.eq(0).text().trim();
        const advisory = $cols.eq(1).text().trim();
        const description = $cols.eq(2).text().trim();
        const severity = this.getSeverityFromText($cols.eq(3).text().trim());
        const link = 'https://www.vmware.com' + $cols.eq(1).find('a').attr('href');
        
        const releaseDate = new Date(dateStr);
        if (releaseDate >= sevenDaysAgo) {
          patches.push({
            title: advisory,
            date: releaseDate.toISOString().split('T')[0],
            severity,
            vendor: 'vmware',
            component: advisory.split(' ')[0], // Usually the product name
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
  const fetcher = new VMwarePatchFetcher();
  fetcher.fetchPatches().catch(console.error);
}

export default VMwarePatchFetcher;
