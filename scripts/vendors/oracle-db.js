import * as cheerio from 'cheerio';
import VendorPatchFetcher from '../vendor-fetch-template.js';
import { fileURLToPath } from 'url';

class OracleDBPatchFetcher extends VendorPatchFetcher {
  constructor() {
    super('oracle-db');
  }

  async fetchPatches() {
    try {
      this.log('Starting Oracle DB patch fetch via OTN security RSS');

      const response = await this.fetchWithRetry(
        'https://www.oracle.com/ocom/groups/public/@otn/documents/webcontent/rss-otn-sec.xml'
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

        const cves = this.extractCVEs(description);

        patches.push({
          title,
          date: pubDate.toISOString().split('T')[0],
          severity: this.getSeverityFromText(title + ' ' + description),
          vendor: 'oracle-db',
          component: this.extractComponent(title),
          description: description.substring(0, 200) + (description.length > 200 ? '...' : ''),
          link,
          cve: cves[0] || ''
        });
      });

      this.log(`Found ${patches.length} advisories from Oracle Security RSS`);
      return await this.updatePatchData(patches);
    } catch (error) {
      this.log(`Failed to fetch patches: ${error.message}`, 'ERROR');
      throw error;
    }
  }

  extractComponent(title) {
    const lower = title.toLowerCase();
    if (lower.includes('database')) return 'Oracle Database';
    if (lower.includes('mysql')) return 'MySQL';
    if (lower.includes('java') || lower.includes('jdk')) return 'Java SE';
    if (lower.includes('weblogic')) return 'WebLogic Server';
    if (lower.includes('fusion middleware')) return 'Fusion Middleware';
    if (lower.includes('e-business')) return 'E-Business Suite';
    if (lower.includes('peoplesoft')) return 'PeopleSoft';
    if (lower.includes('solaris')) return 'Solaris';
    if (lower.includes('vm')) return 'Oracle VM';
    if (lower.includes('linux')) return 'Oracle Linux';
    if (lower.includes('cloud')) return 'Oracle Cloud';
    return 'Oracle Products';
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const fetcher = new OracleDBPatchFetcher();
  fetcher.fetchPatches().catch(console.error);
}

export default OracleDBPatchFetcher;
