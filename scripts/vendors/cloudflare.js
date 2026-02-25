import * as cheerio from 'cheerio';
import VendorPatchFetcher from '../vendor-fetch-template.js';
import { fileURLToPath } from 'url';

class CloudflarePatchFetcher extends VendorPatchFetcher {
  constructor() {
    super('cloudflare');
  }

  async fetchPatches() {
    try {
      this.log('Starting Cloudflare patch fetch via security blog RSS');

      const response = await this.fetchWithRetry(
        'https://blog.cloudflare.com/tag/security/rss/'
      );
      const $ = cheerio.load(response.data, { xmlMode: true });

      const cutoff = this.getSevenDaysAgo();
      const patches = [];

      $('item').each((i, item) => {
        const $item = $(item);
        const title = $item.find('title').text().trim();
        const link = $item.find('link').text().trim();
        const description = this.cleanHtml(
          $item.find('content\\:encoded').text() || $item.find('description').text() || ''
        );
        const pubDate = new Date($item.find('pubDate').text());

        if (isNaN(pubDate.getTime()) || pubDate < cutoff) return;

        // Only include security-relevant posts
        const allText = (title + ' ' + description).toLowerCase();
        const securityKeywords = [
          'vulnerability', 'cve-', 'advisory', 'patch', 'exploit',
          'security update', 'ddos', 'mitigation', 'zero-day',
          'waf', 'firewall', 'ssl', 'tls', 'authentication'
        ];
        if (!securityKeywords.some(kw => allText.includes(kw))) return;

        const cves = this.extractCVEs(title + ' ' + description);

        patches.push({
          title,
          date: pubDate.toISOString().split('T')[0],
          severity: this.getSeverityFromText(title + ' ' + description),
          vendor: 'cloudflare',
          component: this.extractComponent(title + ' ' + description),
          description: description.substring(0, 200) + (description.length > 200 ? '...' : ''),
          link,
          cve: cves[0] || ''
        });
      });

      this.log(`Found ${patches.length} Cloudflare security posts`);
      return await this.updatePatchData(patches);
    } catch (error) {
      this.log(`Failed to fetch patches: ${error.message}`, 'ERROR');
      throw error;
    }
  }

  extractComponent(text) {
    const lower = text.toLowerCase();
    if (lower.includes('waf')) return 'WAF';
    if (lower.includes('workers')) return 'Workers';
    if (lower.includes('dns')) return 'DNS';
    if (lower.includes('ssl') || lower.includes('tls')) return 'SSL/TLS';
    if (lower.includes('zero trust')) return 'Zero Trust';
    if (lower.includes('access')) return 'Access';
    if (lower.includes('tunnel')) return 'Tunnel';
    if (lower.includes('pages')) return 'Pages';
    return 'Cloudflare';
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const fetcher = new CloudflarePatchFetcher();
  fetcher.fetchPatches().catch(console.error);
}

export default CloudflarePatchFetcher;
