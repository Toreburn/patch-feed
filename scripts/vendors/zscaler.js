import * as cheerio from 'cheerio';
import VendorPatchFetcher from '../vendor-fetch-template.js';
import { fileURLToPath } from 'url';

class ZscalerPatchFetcher extends VendorPatchFetcher {
  constructor() {
    super('zscaler');
  }

  async fetchPatches() {
    try {
      this.log('Starting Zscaler patch fetch via trust portal and NVD');

      const cutoff = this.getSevenDaysAgo();
      const patches = [];

      // Zscaler publishes security advisories on trust.zscaler.com
      try {
        const response = await this.fetchWithRetry(
          'https://trust.zscaler.com/security-advisories'
        );
        const $ = cheerio.load(response.data);

        $('a[href*="advisory"], a[href*="security"], table tr, article, .card, [class*="advisory"]').each((i, el) => {
          const $el = $(el);
          const title = ($el.text() || $el.find('h2, h3').first().text() || '').trim();
          const href = $el.attr('href') || $el.find('a').first().attr('href') || '';

          if (!title || title.length < 10) return;

          const parentText = $el.parent().text() || '';
          const dateMatch = parentText.match(/(\d{4}-\d{2}-\d{2})/) ||
                           parentText.match(/(\w+ \d{1,2},? \d{4})/);

          let pubDate = null;
          if (dateMatch) pubDate = new Date(dateMatch[1]);

          if (!pubDate || isNaN(pubDate.getTime()) || pubDate < cutoff) return;

          const cves = this.extractCVEs(title + ' ' + parentText);
          const fullLink = href.startsWith('http') ? href : `https://trust.zscaler.com${href}`;

          patches.push({
            title: `Zscaler: ${title.substring(0, 120)}`,
            date: pubDate.toISOString().split('T')[0],
            severity: this.getSeverityFromText(title + ' ' + parentText),
            vendor: 'zscaler',
            component: this.extractComponent(title),
            description: title.substring(0, 200),
            link: fullLink,
            cve: cves[0] || ''
          });
        });
      } catch (e) {
        this.log(`Trust portal fetch failed: ${e.message}`, 'WARN');
      }

      this.log(`Found ${patches.length} Zscaler security advisories`);
      return await this.updatePatchData(patches);
    } catch (error) {
      this.log(`Failed to fetch patches: ${error.message}`, 'ERROR');
      throw error;
    }
  }

  extractComponent(text) {
    const lower = text.toLowerCase();
    if (lower.includes('zia') || lower.includes('internet access')) return 'Zscaler Internet Access';
    if (lower.includes('zpa') || lower.includes('private access')) return 'Zscaler Private Access';
    if (lower.includes('zdi') || lower.includes('digital experience')) return 'Zscaler Digital Experience';
    if (lower.includes('client connector')) return 'Client Connector';
    return 'Zscaler';
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const fetcher = new ZscalerPatchFetcher();
  fetcher.fetchPatches().catch(console.error);
}

export default ZscalerPatchFetcher;
