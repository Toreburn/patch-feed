import * as cheerio from 'cheerio';
import VendorPatchFetcher from '../vendor-fetch-template.js';
import { fileURLToPath } from 'url';

class NodejsPatchFetcher extends VendorPatchFetcher {
  constructor() {
    super('nodejs');
  }

  async fetchPatches() {
    try {
      this.log('Starting Node.js patch fetch via vulnerability RSS feed');

      const response = await this.fetchWithRetry(
        'https://nodejs.org/en/feed/vulnerability.xml'
      );
      const $ = cheerio.load(response.data, { xmlMode: true });

      const cutoff = this.getSevenDaysAgo();
      const patches = [];

      // Try both RSS and Atom formats
      const items = $('item').length ? $('item') : $('entry');

      items.each((i, item) => {
        const $item = $(item);
        const title = ($item.find('title').text() || '').trim();
        const link = $item.find('link').text().trim() ||
                     $item.find('link').attr('href') || '';
        const description = this.cleanHtml(
          $item.find('description').text() ||
          $item.find('summary').text() ||
          $item.find('content').text() || ''
        );
        const pubDate = new Date(
          $item.find('pubDate').text() ||
          $item.find('published').text() ||
          $item.find('updated').text() || ''
        );

        if (isNaN(pubDate.getTime()) || pubDate < cutoff) return;

        const cves = this.extractCVEs(title + ' ' + description);

        patches.push({
          title,
          date: pubDate.toISOString().split('T')[0],
          severity: this.getSeverityFromText(title + ' ' + description),
          vendor: 'nodejs',
          component: 'Node.js Runtime',
          description: description.substring(0, 200) + (description.length > 200 ? '...' : ''),
          link,
          cve: cves[0] || '',
          cves
        });
      });

      this.log(`Found ${patches.length} Node.js vulnerability advisories`);
      return await this.updatePatchData(patches);
    } catch (error) {
      this.log(`Failed to fetch patches: ${error.message}`, 'ERROR');
      throw error;
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const fetcher = new NodejsPatchFetcher();
  fetcher.fetchPatches().catch(console.error);
}

export default NodejsPatchFetcher;
