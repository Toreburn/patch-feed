import * as cheerio from 'cheerio';
import VendorPatchFetcher from '../vendor-fetch-template.js';
import { fileURLToPath } from 'url';

class JetBrainsPatchFetcher extends VendorPatchFetcher {
  constructor() {
    super('jetbrains');
  }

  async fetchPatches() {
    try {
      this.log('Starting JetBrains patch fetch via security blog RSS');

      const response = await this.fetchWithRetry(
        'https://blog.jetbrains.com/security/feed/'
      );
      const $ = cheerio.load(response.data, { xmlMode: true });

      const cutoff = this.getSevenDaysAgo();
      const patches = [];

      $('item').each((i, item) => {
        const $item = $(item);
        const title = $item.find('title').text().trim();
        const link = $item.find('link').text().trim();
        const description = this.cleanHtml(
          $item.find('content\\:encoded').text() || $item.find('description').text()
        );
        const pubDate = new Date($item.find('pubDate').text());

        if (pubDate < cutoff) return;

        const cves = this.extractCVEs(title + ' ' + description);

        patches.push({
          title,
          date: pubDate.toISOString().split('T')[0],
          severity: this.getSeverityFromText(title + ' ' + description),
          vendor: 'jetbrains',
          component: this.extractComponent(title + ' ' + description),
          description: description.substring(0, 200) + (description.length > 200 ? '...' : ''),
          link,
          cve: cves[0] || ''
        });
      });

      this.log(`Found ${patches.length} security posts from JetBrains RSS`);
      return await this.updatePatchData(patches);
    } catch (error) {
      this.log(`Failed to fetch patches: ${error.message}`, 'ERROR');
      throw error;
    }
  }

  extractComponent(text) {
    const products = [
      'IntelliJ IDEA', 'PyCharm', 'WebStorm', 'PhpStorm', 'RubyMine',
      'CLion', 'GoLand', 'Rider', 'DataGrip', 'DataSpell',
      'TeamCity', 'YouTrack', 'Hub', 'Space', 'Kotlin',
      'ReSharper', 'dotPeek', 'dotTrace', 'dotMemory', 'Ktor',
      'Fleet', 'Aqua', 'RustRover', 'Writerside'
    ];
    const lower = text.toLowerCase();
    for (const product of products) {
      if (lower.includes(product.toLowerCase())) return product;
    }
    return 'JetBrains Products';
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const fetcher = new JetBrainsPatchFetcher();
  fetcher.fetchPatches().catch(console.error);
}

export default JetBrainsPatchFetcher;
