import * as cheerio from 'cheerio';
import VendorPatchFetcher from '../vendor-fetch-template.js';
import { fileURLToPath } from 'url';

class MysqlPatchFetcher extends VendorPatchFetcher {
  constructor() {
    super('mysql');
  }

  async fetchPatches() {
    try {
      this.log('Starting MySQL patch fetch via Oracle RSS and NVD');

      const cutoff = this.getSevenDaysAgo();
      const patches = [];

      // MySQL security updates come through Oracle Critical Patch Updates
      // Try Oracle's security RSS feed first, filtered for MySQL
      try {
        const response = await this.fetchWithRetry(
          'https://www.oracle.com/ocom/groups/public/@otn/documents/webcontent/rss-otn-sec.xml'
        );
        const $ = cheerio.load(response.data, { xmlMode: true });

        $('item').each((i, item) => {
          const $item = $(item);
          const title = $item.find('title').text().trim();
          const link = $item.find('link').text().trim();
          const description = this.cleanHtml($item.find('description').text() || '');
          const pubDate = new Date($item.find('pubDate').text());

          if (isNaN(pubDate.getTime()) || pubDate < cutoff) return;

          const allText = (title + ' ' + description).toLowerCase();
          if (!allText.includes('mysql')) return;

          const cves = this.extractCVEs(title + ' ' + description);

          patches.push({
            title,
            date: pubDate.toISOString().split('T')[0],
            severity: this.getSeverityFromText(title + ' ' + description),
            vendor: 'mysql',
            component: this.extractComponent(title + ' ' + description),
            description: description.substring(0, 200) + (description.length > 200 ? '...' : ''),
            link,
            cve: cves[0] || '',
            cves
          });
        });
      } catch (e) {
        this.log(`Oracle RSS fetch failed: ${e.message}`, 'WARN');
      }

      this.log(`Found ${patches.length} MySQL security advisories`);
      return await this.updatePatchData(patches);
    } catch (error) {
      this.log(`Failed to fetch patches: ${error.message}`, 'ERROR');
      throw error;
    }
  }

  extractComponent(text) {
    const lower = text.toLowerCase();
    if (lower.includes('innodb')) return 'MySQL InnoDB';
    if (lower.includes('server')) return 'MySQL Server';
    if (lower.includes('connector')) return 'MySQL Connector';
    if (lower.includes('workbench')) return 'MySQL Workbench';
    if (lower.includes('cluster')) return 'MySQL Cluster';
    if (lower.includes('shell')) return 'MySQL Shell';
    return 'MySQL';
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const fetcher = new MysqlPatchFetcher();
  fetcher.fetchPatches().catch(console.error);
}

export default MysqlPatchFetcher;
