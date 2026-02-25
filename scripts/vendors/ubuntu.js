import axios from 'axios';
import * as cheerio from 'cheerio';
import VendorPatchFetcher from '../vendor-fetch-template.js';
import { fileURLToPath } from 'url';

class UbuntuPatchFetcher extends VendorPatchFetcher {
  constructor() {
    super('ubuntu');
  }

  getSeverityFromDescription(description) {
    const lower = description.toLowerCase();
    if (lower.includes('critical')) return 'CRITICAL';
    if (lower.includes('high')) return 'HIGH';
    if (lower.includes('medium')) return 'MEDIUM';
    if (lower.includes('low')) return 'LOW';
    return 'UNKNOWN';
  }

  getComponentFromTitle(title) {
    // Extract package name from USN title format: "USN-XXXX-X: Package vulnerability"
    const match = title.match(/USN-\d+-\d+:\s*([^:]+?)(?:\s+vulnerability|\s+update|\s*$)/i);
    return match ? match[1].trim() : 'Multiple Products';
  }

  async fetchPatches() {
    try {
      this.log('Starting Ubuntu patch fetch');
      
      // Fetch from Ubuntu Security Notices RSS feed
      const response = await axios.get('https://ubuntu.com/security/notices/rss.xml');
      const $ = cheerio.load(response.data, { xmlMode: true });
      
      const sevenDaysAgo = this.getSevenDaysAgo();
      const patches = [];

      $('item').each((i, item) => {
        const $item = $(item);
        const title = $item.find('title').text().trim();
        const pubDate = new Date($item.find('pubDate').text());
        const description = $item.find('description').text().trim();
        const link = $item.find('link').text().trim();
        
        if (pubDate >= sevenDaysAgo) {
          patches.push({
            title,
            date: pubDate.toISOString().split('T')[0],
            severity: this.getSeverityFromDescription(description),
            vendor: 'ubuntu',
            component: this.getComponentFromTitle(title),
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
  const fetcher = new UbuntuPatchFetcher();
  fetcher.fetchPatches().catch(console.error);
}

export default UbuntuPatchFetcher;
