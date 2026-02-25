import axios from 'axios';
import * as cheerio from 'cheerio';
import VendorPatchFetcher from '../vendor-fetch-template.js';
import { fileURLToPath } from 'url';

class ChromePatchFetcher extends VendorPatchFetcher {
  constructor() {
    super('chrome');
  }

  async fetchPatches() {
    try {
      this.log('Starting Chrome patch fetch via Blogger Atom feed');

      const response = await this.fetchWithRetry(
        'https://chromereleases.googleblog.com/feeds/posts/default/-/Stable%20updates'
      );
      const $ = cheerio.load(response.data, { xmlMode: true });

      const sevenDaysAgo = this.getSevenDaysAgo();
      const patches = [];

      $('entry').each((i, entry) => {
        const $entry = $(entry);
        const title = $entry.find('title').text().trim();
        const published = new Date($entry.find('published').text());
        const content = $entry.find('content').text().trim();
        const link = $entry.find('link[href]').attr('href') || '';

        if (published >= sevenDaysAgo) {
          // Determine severity from content keywords
          let severity = 'UNKNOWN';
          const contentLower = content.toLowerCase();
          if (contentLower.includes('critical')) severity = 'CRITICAL';
          else if (contentLower.includes('high')) severity = 'HIGH';
          else if (contentLower.includes('medium')) severity = 'MEDIUM';
          else if (contentLower.includes('low')) severity = 'LOW';

          patches.push({
            title,
            date: published.toISOString().split('T')[0],
            severity,
            vendor: 'chrome',
            component: 'Chrome Browser',
            description: content.replace(/<[^>]+>/g, '').substring(0, 200) + (content.length > 200 ? '...' : ''),
            link
          });
        }
      });

      if (patches.length === 0) {
        this.log('No new patches found in the lookback period');
      }

      return await this.updatePatchData(patches);
    } catch (error) {
      this.log(`Failed to fetch patches: ${error.message}`, 'ERROR');
      throw error;
    }
  }
}

export default ChromePatchFetcher;

// Execute if run directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const fetcher = new ChromePatchFetcher();
  fetcher.fetchPatches().catch(console.error);
}
