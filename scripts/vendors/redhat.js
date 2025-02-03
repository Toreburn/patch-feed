import axios from 'axios';
import * as cheerio from 'cheerio';
import VendorPatchFetcher from '../vendor-fetch-template.js';
import { fileURLToPath } from 'url';

class RedHatPatchFetcher extends VendorPatchFetcher {
  constructor() {
    super('redhat');
  }

  async fetchPatches() {
    try {
      this.log('Starting Red Hat patch fetch');
      
      // Fetch from Red Hat Security Advisories feed
      const response = await axios.get('https://access.redhat.com/errata/rss/rhsa-2025.xml');
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
          // Extract severity from title (format: "RHSA-2025:XXXX-X (Severity) ...")
          const severityMatch = title.match(/\((.*?)\)/);
          const severity = severityMatch ? severityMatch[1].toUpperCase() : 'UNKNOWN';
          
          patches.push({
            title,
            date: pubDate.toISOString().split('T')[0],
            severity,
            vendor: 'redhat',
            component: 'Multiple Products',
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
  const fetcher = new RedHatPatchFetcher();
  fetcher.fetchPatches().catch(console.error);
}

export default RedHatPatchFetcher;
