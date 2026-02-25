import * as cheerio from 'cheerio';
import VendorPatchFetcher from '../vendor-fetch-template.js';
import { fileURLToPath } from 'url';

class PostgreSQLPatchFetcher extends VendorPatchFetcher {
  constructor() {
    super('postgresql');
  }

  async fetchPatches() {
    try {
      this.log('Starting PostgreSQL patch fetch via news RSS (security filter)');

      const response = await this.fetchWithRetry(
        'https://www.postgresql.org/news.rss'
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

        // Only include security-related items
        const allText = (title + ' ' + description).toLowerCase();
        const securityKeywords = [
          'security', 'vulnerability', 'cve-', 'update release',
          'patch', 'bug fix release', 'minor version'
        ];
        if (!securityKeywords.some(kw => allText.includes(kw))) return;

        if (pubDate < cutoff) return;

        const cves = this.extractCVEs(title + ' ' + description);

        patches.push({
          title,
          date: pubDate.toISOString().split('T')[0],
          severity: this.getSeverityFromText(description),
          vendor: 'postgresql',
          component: 'PostgreSQL',
          description: description.substring(0, 200) + (description.length > 200 ? '...' : ''),
          link,
          cve: cves[0] || ''
        });
      });

      this.log(`Found ${patches.length} security-related items from PostgreSQL RSS`);
      return await this.updatePatchData(patches);
    } catch (error) {
      this.log(`Failed to fetch patches: ${error.message}`, 'ERROR');
      throw error;
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const fetcher = new PostgreSQLPatchFetcher();
  fetcher.fetchPatches().catch(console.error);
}

export default PostgreSQLPatchFetcher;
