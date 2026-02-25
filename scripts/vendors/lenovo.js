import * as cheerio from 'cheerio';
import VendorPatchFetcher from '../vendor-fetch-template.js';
import { fileURLToPath } from 'url';

class LenovoPatchFetcher extends VendorPatchFetcher {
  constructor() {
    super('lenovo');
  }

  async fetchPatches() {
    try {
      this.log('Starting Lenovo patch fetch via PSIRT advisories and NVD');

      const cutoff = this.getSevenDaysAgo();
      const patches = [];

      // Lenovo PSIRT publishes security advisories
      try {
        const response = await this.fetchWithRetry(
          'https://support.lenovo.com/us/en/product_security/home'
        );
        const $ = cheerio.load(response.data);

        $('a[href*="LEN-"], a[href*="product_security"], table tr, .advisory, [class*="security"]').each((i, el) => {
          const $el = $(el);
          const title = ($el.find('td').first().text() || $el.text() || '').trim();
          const href = $el.find('a').first().attr('href') || $el.attr('href') || '';

          if (!title || title.length < 10) return;

          const rowText = $el.text();
          const dateMatch = rowText.match(/(\d{4}-\d{2}-\d{2})/) ||
                           rowText.match(/(\d{1,2}\/\d{1,2}\/\d{4})/) ||
                           rowText.match(/(\w+ \d{1,2},? \d{4})/);

          let pubDate = null;
          if (dateMatch) pubDate = new Date(dateMatch[1]);

          if (!pubDate || isNaN(pubDate.getTime()) || pubDate < cutoff) return;

          const cves = this.extractCVEs(rowText);
          const fullLink = href.startsWith('http') ? href : `https://support.lenovo.com${href}`;

          patches.push({
            title: `Lenovo: ${title.substring(0, 120)}`,
            date: pubDate.toISOString().split('T')[0],
            severity: this.getSeverityFromText(rowText),
            vendor: 'lenovo',
            component: this.extractComponent(title),
            description: title.substring(0, 200),
            link: fullLink,
            cve: cves[0] || '',
            cves
          });
        });
      } catch (e) {
        this.log(`Lenovo PSIRT page fetch failed: ${e.message}`, 'WARN');
      }

      this.log(`Found ${patches.length} Lenovo security advisories`);
      return await this.updatePatchData(patches);
    } catch (error) {
      this.log(`Failed to fetch patches: ${error.message}`, 'ERROR');
      throw error;
    }
  }

  extractComponent(text) {
    const lower = text.toLowerCase();
    if (lower.includes('thinkpad')) return 'ThinkPad';
    if (lower.includes('thinkcentre')) return 'ThinkCentre';
    if (lower.includes('thinkstation')) return 'ThinkStation';
    if (lower.includes('thinkagile')) return 'ThinkAgile';
    if (lower.includes('thinksystem')) return 'ThinkSystem';
    if (lower.includes('bios') || lower.includes('uefi')) return 'BIOS/UEFI';
    if (lower.includes('xclarity')) return 'XClarity';
    if (lower.includes('vantage')) return 'Vantage';
    return 'Lenovo Products';
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const fetcher = new LenovoPatchFetcher();
  fetcher.fetchPatches().catch(console.error);
}

export default LenovoPatchFetcher;
