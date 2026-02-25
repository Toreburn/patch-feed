import * as cheerio from 'cheerio';
import VendorPatchFetcher from '../vendor-fetch-template.js';
import { fileURLToPath } from 'url';

class SonicWallPatchFetcher extends VendorPatchFetcher {
  constructor() {
    super('sonicwall');
  }

  async fetchPatches() {
    try {
      this.log('Starting SonicWall patch fetch via PSIRT RSS');

      const response = await this.fetchWithRetry(
        'https://psirt.global.sonicwall.com/rss-feeds'
      );
      const $ = cheerio.load(response.data, { xmlMode: true });

      const cutoff = this.getSevenDaysAgo();
      const patches = [];

      $('item').each((i, item) => {
        const $item = $(item);
        const title = $item.find('title').text().trim();
        const link = $item.find('link').text().trim();
        const description = this.cleanHtml($item.find('description').text());
        const pubDate = new Date($item.find('pubDate').text());

        if (pubDate < cutoff) return;

        const cves = this.extractCVEs(title + ' ' + description);

        patches.push({
          title,
          date: pubDate.toISOString().split('T')[0],
          severity: this.getSeverityFromText(title + ' ' + description),
          vendor: 'sonicwall',
          component: this.extractComponent(title),
          description: description.substring(0, 200) + (description.length > 200 ? '...' : ''),
          link,
          cve: cves[0] || ''
        });
      });

      this.log(`Found ${patches.length} advisories from SonicWall PSIRT RSS`);
      return await this.updatePatchData(patches);
    } catch (error) {
      this.log(`Failed to fetch patches: ${error.message}`, 'ERROR');
      throw error;
    }
  }

  extractComponent(title) {
    const products = [
      'SonicOS', 'SMA', 'NetExtender', 'Capture Client',
      'Email Security', 'GMS', 'Analytics', 'Access Points',
      'NSv', 'TZ', 'NSa', 'NSsp', 'SuperMassive'
    ];
    const lower = title.toLowerCase();
    for (const product of products) {
      if (lower.includes(product.toLowerCase())) return product;
    }
    return 'SonicWall Products';
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const fetcher = new SonicWallPatchFetcher();
  fetcher.fetchPatches().catch(console.error);
}

export default SonicWallPatchFetcher;
