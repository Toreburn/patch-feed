import * as cheerio from 'cheerio';
import VendorPatchFetcher from '../vendor-fetch-template.js';
import { fileURLToPath } from 'url';

class PaloAltoPatchFetcher extends VendorPatchFetcher {
  constructor() {
    super('paloalto');
  }

  async fetchPatches() {
    try {
      this.log('Starting Palo Alto patch fetch via security RSS');

      const response = await this.fetchWithRetry(
        'https://security.paloaltonetworks.com/rss.xml'
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
          vendor: 'paloalto',
          component: this.extractComponent(title),
          description: description.substring(0, 200) + (description.length > 200 ? '...' : ''),
          link,
          cve: cves[0] || ''
        });
      });

      this.log(`Found ${patches.length} advisories from Palo Alto RSS`);
      return await this.updatePatchData(patches);
    } catch (error) {
      this.log(`Failed to fetch patches: ${error.message}`, 'ERROR');
      throw error;
    }
  }

  extractComponent(title) {
    const products = [
      'PAN-OS', 'Panorama', 'Cortex XDR', 'Cortex XSOAR', 'Cortex',
      'Prisma Cloud', 'Prisma Access', 'Prisma',
      'GlobalProtect', 'Expedition', 'Cloud NGFW'
    ];
    const lower = title.toLowerCase();
    for (const product of products) {
      if (lower.includes(product.toLowerCase())) return product;
    }
    return 'Palo Alto Networks';
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const fetcher = new PaloAltoPatchFetcher();
  fetcher.fetchPatches().catch(console.error);
}

export default PaloAltoPatchFetcher;
