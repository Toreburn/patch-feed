import * as cheerio from 'cheerio';
import VendorPatchFetcher from '../vendor-fetch-template.js';
import { fileURLToPath } from 'url';

class F5PatchFetcher extends VendorPatchFetcher {
  constructor() {
    super('f5');
  }

  async fetchPatches() {
    try {
      this.log('Starting F5 patch fetch via support portal');

      const cutoff = this.getSevenDaysAgo();
      const patches = [];

      // F5 publishes security advisories on my.f5.com (Salesforce-based)
      // Scrape the quarterly security notification / advisory listing
      const response = await this.fetchWithRetry(
        'https://my.f5.com/manage/s/article/K000135931',
        { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PatchFeed/1.0)' } }
      );
      const $ = cheerio.load(response.data);

      // Look for advisory links in the page (K-article format)
      $('a[href*="/article/K"]').each((i, el) => {
        const $el = $(el);
        const title = $el.text().trim();
        const href = $el.attr('href') || '';

        if (!title || title.length < 10) return;

        // Look for CVEs and security keywords
        const parentText = $el.parent().text() || '';
        const allText = title + ' ' + parentText;
        if (!allText.match(/CVE|security|vulnerability|advisory/i)) return;

        // Try to find a date
        const dateMatch = parentText.match(/(\d{4}-\d{2}-\d{2})/) ||
                         parentText.match(/(\w+ \d{1,2},? \d{4})/);
        let pubDate = dateMatch ? new Date(dateMatch[1]) : null;

        if (!pubDate || isNaN(pubDate.getTime()) || pubDate < cutoff) return;

        const fullLink = href.startsWith('http') ? href : `https://my.f5.com${href}`;
        const cves = this.extractCVEs(allText);

        patches.push({
          title: `F5: ${title.substring(0, 120)}`,
          date: pubDate.toISOString().split('T')[0],
          severity: this.getSeverityFromText(allText),
          vendor: 'f5',
          component: this.extractComponent(title),
          description: title.substring(0, 200),
          link: fullLink,
          cve: cves[0] || '',
          cves
        });
      });

      this.log(`Found ${patches.length} F5 security advisories`);
      return await this.updatePatchData(patches);
    } catch (error) {
      this.log(`Failed to fetch patches: ${error.message}`, 'ERROR');
      throw error;
    }
  }

  extractComponent(text) {
    const lower = text.toLowerCase();
    if (lower.includes('big-ip')) return 'BIG-IP';
    if (lower.includes('big-iq')) return 'BIG-IQ';
    if (lower.includes('nginx')) return 'NGINX';
    if (lower.includes('f5os')) return 'F5OS';
    if (lower.includes('distributed cloud') || lower.includes('volterra')) return 'Distributed Cloud';
    return 'F5 Products';
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const fetcher = new F5PatchFetcher();
  fetcher.fetchPatches().catch(console.error);
}

export default F5PatchFetcher;
