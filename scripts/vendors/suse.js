import axios from 'axios';
import * as cheerio from 'cheerio';
import VendorPatchFetcher from '../vendor-fetch-template.js';
import { fileURLToPath } from 'url';

class SusePatchFetcher extends VendorPatchFetcher {
  constructor() {
    super('suse');
  }

  getSeverityFromCategory(category) {
    const lower = category.toLowerCase();
    if (lower.includes('critical')) return 'CRITICAL';
    if (lower.includes('important')) return 'HIGH';
    if (lower.includes('moderate')) return 'MEDIUM';
    if (lower.includes('low')) return 'LOW';
    return 'UNKNOWN';
  }

  getComponentFromTitle(title) {
    // Extract package name from SUSE advisory format
    const match = title.match(/(?:SUSE-SU|SUSE-RU)-\d+:\s*([^-]+)/i);
    return match ? match[1].trim() : 'Multiple Products';
  }

  async fetchPatches() {
    try {
      this.log('Starting SUSE patch fetch');
      
      // Fetch from SUSE Security Advisories page
      const response = await axios.get('https://www.suse.com/support/update/', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });
      
      const $ = cheerio.load(response.data);
      const sevenDaysAgo = this.getSevenDaysAgo();
      const patches = [];

      // Parse the security advisories table
      $('.content table tr').each((i, row) => {
        if (i === 0) return; // Skip header row
        
        const $cols = $(row).find('td');
        if ($cols.length < 3) return;
        
        const dateStr = $cols.eq(0).text().trim();
        const title = $cols.eq(1).text().trim();
        const severity = $cols.eq(2).text().trim() || 'Unknown';
        const link = 'https://www.suse.com' + $cols.eq(1).find('a').attr('href');
        
        const releaseDate = new Date(dateStr);
        if (releaseDate >= sevenDaysAgo) {
          patches.push({
            title,
            date: releaseDate.toISOString().split('T')[0],
            severity: severity.toUpperCase(),
            vendor: 'suse',
            component: 'Multiple Products',
            description: `Security update for ${title}`,
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
  const fetcher = new SusePatchFetcher();
  fetcher.fetchPatches().catch(console.error);
}

export default SusePatchFetcher;
