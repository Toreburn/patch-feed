import * as cheerio from 'cheerio';
import VendorPatchFetcher from '../vendor-fetch-template.js';
import { fileURLToPath } from 'url';

class TrendMicroPatchFetcher extends VendorPatchFetcher {
  constructor() {
    super('trendmicro');
  }

  async fetchPatches() {
    try {
      this.log('Starting Trend Micro patch fetch via vulnerability response page');

      const cutoff = this.getSevenDaysAgo();
      const patches = [];

      // Trend Micro publishes advisories on their success portal
      const response = await this.fetchWithRetry(
        'https://success.trendmicro.com/dcx/s/vulnerability-response?language=en_US'
      );
      const $ = cheerio.load(response.data);

      // Parse advisory listings
      $('a[href*="vulnerability"], a[href*="advisory"], table tr, article, .card').each((i, el) => {
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
        const fullLink = href.startsWith('http') ? href : `https://success.trendmicro.com${href}`;

        patches.push({
          title: `Trend Micro: ${title.substring(0, 120)}`,
          date: pubDate.toISOString().split('T')[0],
          severity: this.getSeverityFromText(title + ' ' + parentText),
          vendor: 'trendmicro',
          component: this.extractComponent(title),
          description: title.substring(0, 200),
          link: fullLink,
          cve: cves[0] || ''
        });
      });

      this.log(`Found ${patches.length} Trend Micro security advisories`);
      return await this.updatePatchData(patches);
    } catch (error) {
      this.log(`Failed to fetch patches: ${error.message}`, 'ERROR');
      throw error;
    }
  }

  extractComponent(text) {
    const lower = text.toLowerCase();
    if (lower.includes('apex one')) return 'Apex One';
    if (lower.includes('deep security')) return 'Deep Security';
    if (lower.includes('worry-free') || lower.includes('wfbs')) return 'Worry-Free Business Security';
    if (lower.includes('cloud one')) return 'Cloud One';
    if (lower.includes('vision one')) return 'Vision One';
    if (lower.includes('officescan')) return 'OfficeScan';
    if (lower.includes('smart protection')) return 'Smart Protection';
    return 'Trend Micro Products';
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const fetcher = new TrendMicroPatchFetcher();
  fetcher.fetchPatches().catch(console.error);
}

export default TrendMicroPatchFetcher;
