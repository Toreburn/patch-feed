import VendorPatchFetcher from '../vendor-fetch-template.js';
import axios from 'axios';
import * as cheerio from 'cheerio';

class CitrixPatchFetcher extends VendorPatchFetcher {
  constructor() {
    super('citrix');
  }

  async fetchPatches() {
    try {
      // Citrix Security Bulletins URL
      const response = await axios.get('https://support.citrix.com/feed/products/security');
      const $ = cheerio.load(response.data, { xmlMode: true });
      
      const patches = [];
      const sevenDaysAgo = this.getSevenDaysAgo();

      $('item').each((_, item) => {
        const $item = $(item);
        const title = $item.find('title').text();
        const link = $item.find('link').text();
        const pubDate = new Date($item.find('pubDate').text());
        const description = $item.find('description').text();

        // Only include patches from the last 7 days
        if (pubDate >= sevenDaysAgo) {
          patches.push({
            title,
            url: link,
            date: pubDate.toISOString(),
            description: description.trim(),
            severity: this.extractSeverity(description),
            vendor: 'citrix'
          });
        }
      });

      return this.updatePatchData(patches);
    } catch (error) {
      this.log(`Error fetching patches: ${error.message}`, 'ERROR');
      throw error;
    }
  }

  extractSeverity(description) {
    const lower = description.toLowerCase();
    if (lower.includes('critical')) return 'Critical';
    if (lower.includes('high')) return 'High';
    if (lower.includes('medium')) return 'Medium';
    if (lower.includes('low')) return 'Low';
    return 'Unknown';
  }
}

// Run the fetcher if this script is called directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const fetcher = new CitrixPatchFetcher();
  fetcher.fetchPatches().catch(console.error);
}

export default CitrixPatchFetcher;
