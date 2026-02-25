import * as cheerio from 'cheerio';
import VendorPatchFetcher from '../vendor-fetch-template.js';
import { fileURLToPath } from 'url';

class CitrixPatchFetcher extends VendorPatchFetcher {
  constructor() {
    super('citrix');
  }

  async fetchPatches() {
    try {
      this.log('Starting Citrix patch fetch via security bulletins RSS');

      const response = await this.fetchWithRetry(
        'https://support.citrix.com/feed/products/all/securitybulletins.rss'
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
          vendor: 'citrix',
          component: this.extractComponent(title),
          description: description.substring(0, 200) + (description.length > 200 ? '...' : ''),
          link,
          cve: cves[0] || ''
        });
      });

      this.log(`Found ${patches.length} security bulletins from Citrix RSS`);
      return await this.updatePatchData(patches);
    } catch (error) {
      this.log(`Failed to fetch patches: ${error.message}`, 'ERROR');
      throw error;
    }
  }

  extractComponent(title) {
    const products = [
      'NetScaler ADC', 'NetScaler Gateway', 'NetScaler',
      'Citrix ADC', 'Citrix Gateway',
      'Virtual Apps and Desktops', 'XenApp', 'XenDesktop',
      'Workspace', 'Hypervisor', 'XenServer',
      'ShareFile', 'Endpoint Management', 'SD-WAN'
    ];
    const lower = title.toLowerCase();
    for (const product of products) {
      if (lower.includes(product.toLowerCase())) return product;
    }
    return 'Citrix Products';
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const fetcher = new CitrixPatchFetcher();
  fetcher.fetchPatches().catch(console.error);
}

export default CitrixPatchFetcher;
