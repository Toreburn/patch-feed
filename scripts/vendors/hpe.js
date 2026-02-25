import * as cheerio from 'cheerio';
import VendorPatchFetcher from '../vendor-fetch-template.js';
import { fileURLToPath } from 'url';

class HpePatchFetcher extends VendorPatchFetcher {
  constructor() {
    super('hpe');
  }

  async fetchPatches() {
    try {
      this.log('Starting HPE patch fetch via security bulletins and NVD');

      const cutoff = this.getSevenDaysAgo();
      const patches = [];

      // HPE publishes security bulletins on their support portal
      try {
        const response = await this.fetchWithRetry(
          'https://support.hpe.com/hpesc/public/km/search?q=security+bulletin&doctype=security_bulletin_&sortBy=relevance'
        );
        const $ = cheerio.load(response.data);

        $('a[href*="security"], a[href*="bulletin"], .search-result, table tr, article').each((i, el) => {
          const $el = $(el);
          const title = ($el.find('h3, h4, .title').first().text() || $el.text() || '').trim();
          const href = $el.find('a').first().attr('href') || $el.attr('href') || '';

          if (!title || title.length < 10) return;

          const parentText = $el.text() || '';
          const dateMatch = parentText.match(/(\d{4}-\d{2}-\d{2})/) ||
                           parentText.match(/(\w+ \d{1,2},? \d{4})/);

          let pubDate = null;
          if (dateMatch) pubDate = new Date(dateMatch[1]);

          if (!pubDate || isNaN(pubDate.getTime()) || pubDate < cutoff) return;

          const cves = this.extractCVEs(title + ' ' + parentText);
          const fullLink = href.startsWith('http') ? href : `https://support.hpe.com${href}`;

          patches.push({
            title: `HPE: ${title.substring(0, 120)}`,
            date: pubDate.toISOString().split('T')[0],
            severity: this.getSeverityFromText(title + ' ' + parentText),
            vendor: 'hpe',
            component: this.extractComponent(title),
            description: title.substring(0, 200),
            link: fullLink,
            cve: cves[0] || '',
            cves
          });
        });
      } catch (e) {
        this.log(`HPE support page fetch failed: ${e.message}`, 'WARN');
      }

      this.log(`Found ${patches.length} HPE security advisories`);
      return await this.updatePatchData(patches);
    } catch (error) {
      this.log(`Failed to fetch patches: ${error.message}`, 'ERROR');
      throw error;
    }
  }

  extractComponent(text) {
    const lower = text.toLowerCase();
    if (lower.includes('ilo')) return 'iLO';
    if (lower.includes('proliant')) return 'ProLiant';
    if (lower.includes('synergy')) return 'Synergy';
    if (lower.includes('oneview')) return 'OneView';
    if (lower.includes('simplivity')) return 'SimpliVity';
    if (lower.includes('nimble') || lower.includes('alletra')) return 'Storage';
    if (lower.includes('aruba')) return 'Aruba/Networking';
    if (lower.includes('comware') || lower.includes('switch')) return 'Networking';
    return 'HPE Products';
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const fetcher = new HpePatchFetcher();
  fetcher.fetchPatches().catch(console.error);
}

export default HpePatchFetcher;
