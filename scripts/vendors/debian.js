import * as cheerio from 'cheerio';
import VendorPatchFetcher from '../vendor-fetch-template.js';
import { fileURLToPath } from 'url';

class DebianPatchFetcher extends VendorPatchFetcher {
  constructor() {
    super('debian');
  }

  async fetchPatches() {
    try {
      this.log('Starting Debian patch fetch via DSA RSS feed');

      const response = await this.fetchWithRetry(
        'https://www.debian.org/security/dsa-long'
      );
      const $ = cheerio.load(response.data, { xmlMode: true });

      const cutoff = this.getSevenDaysAgo();
      const patches = [];

      $('item').each((i, item) => {
        const $item = $(item);
        const title = $item.find('title').text().trim();
        const link = $item.find('link').text().trim();
        const description = this.cleanHtml(
          $item.find('description').text() || ''
        );
        const pubDate = new Date($item.find('dc\\:date').text() || $item.find('pubDate').text());

        if (isNaN(pubDate.getTime()) || pubDate < cutoff) return;

        const cves = this.extractCVEs(title + ' ' + description);

        patches.push({
          title,
          date: pubDate.toISOString().split('T')[0],
          severity: this.getSeverityFromText(description),
          vendor: 'debian',
          component: this.extractComponent(title),
          description: description.substring(0, 200) + (description.length > 200 ? '...' : ''),
          link,
          cve: cves[0] || '',
          cves
        });
      });

      this.log(`Found ${patches.length} Debian security advisories`);
      return await this.updatePatchData(patches);
    } catch (error) {
      this.log(`Failed to fetch patches: ${error.message}`, 'ERROR');
      throw error;
    }
  }

  extractComponent(title) {
    // DSA titles are like "DSA-XXXX-1 package -- security update"
    const match = title.match(/DSA-\d+-\d+\s+(\S+)/);
    return match ? match[1] : 'Debian';
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const fetcher = new DebianPatchFetcher();
  fetcher.fetchPatches().catch(console.error);
}

export default DebianPatchFetcher;
