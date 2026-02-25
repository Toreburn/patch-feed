import * as cheerio from 'cheerio';
import VendorPatchFetcher from '../vendor-fetch-template.js';
import { fileURLToPath } from 'url';

class ArubaPatchFetcher extends VendorPatchFetcher {
  constructor() {
    super('aruba');
  }

  async fetchPatches() {
    try {
      this.log('Starting Aruba/HPE patch fetch via security advisories');

      const cutoff = this.getSevenDaysAgo();
      const patches = [];

      // Aruba advisories are also published via HPE support
      // Try the HPE Aruba Networking security advisories
      const response = await this.fetchWithRetry(
        'https://networkingsupport.hpe.com/notifications/security',
        { headers: { 'User-Agent': 'PatchFeed/1.0' } }
      );
      const $ = cheerio.load(response.data);

      $('table tr, a[href*="advisory"], a[href*="security"], article, .card, [class*="advisory"]').each((i, el) => {
        const $el = $(el);
        const cells = $el.find('td');
        const title = (cells.eq(0).text() || $el.find('h2, h3, a').first().text() || $el.text() || '').trim();
        const link = $el.find('a').first().attr('href') || $el.attr('href') || '';

        if (!title || title.length < 5 || title.toLowerCase().includes('title')) return;

        const rowText = $el.text();
        const dateMatch = rowText.match(/(\d{4}-\d{2}-\d{2})/) ||
                         rowText.match(/(\w+ \d{1,2},? \d{4})/);

        let pubDate = null;
        if (dateMatch) pubDate = new Date(dateMatch[1]);

        if (!pubDate || isNaN(pubDate.getTime()) || pubDate < cutoff) return;

        const fullLink = link.startsWith('http') ? link : `https://networkingsupport.hpe.com${link}`;
        const cves = this.extractCVEs(rowText);

        patches.push({
          title: title.includes('Aruba') ? title.substring(0, 150) : `Aruba: ${title.substring(0, 140)}`,
          date: pubDate.toISOString().split('T')[0],
          severity: this.getSeverityFromText(rowText),
          vendor: 'aruba',
          component: this.extractComponent(title),
          description: title.substring(0, 200),
          link: fullLink,
          cve: cves[0] || '',
          cves
        });
      });

      // Fallback: try the old Aruba Networks URL with User-Agent
      if (patches.length === 0) {
        this.log('Trying legacy Aruba security bulletins page');
        try {
          const altResp = await this.fetchWithRetry(
            'https://www.arubanetworks.com/support-services/security-bulletins/',
            { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PatchFeed/1.0)' } }
          );
          const $a = cheerio.load(altResp.data);

          $a('table tr').each((i, el) => {
            const $el = $a(el);
            const cells = $el.find('td');
            if (cells.length < 2) return;

            const title = cells.eq(0).text().trim();
            const link = cells.eq(0).find('a').attr('href') || '';
            const dateText = cells.eq(1).text().trim();

            if (!title || title.length < 5) return;

            const pubDate = new Date(dateText);
            if (isNaN(pubDate.getTime()) || pubDate < cutoff) return;

            const fullLink = link.startsWith('http') ? link : `https://www.arubanetworks.com${link}`;
            const cves = this.extractCVEs($el.text());

            patches.push({
              title: `Aruba: ${title.substring(0, 140)}`,
              date: pubDate.toISOString().split('T')[0],
              severity: this.getSeverityFromText($el.text()),
              vendor: 'aruba',
              component: this.extractComponent(title),
              description: title.substring(0, 200),
              link: fullLink,
              cve: cves[0] || ''
            });
          });
        } catch (e) {
          this.log(`Legacy page fallback failed: ${e.message}`, 'WARN');
        }
      }

      this.log(`Found ${patches.length} Aruba security advisories`);
      return await this.updatePatchData(patches);
    } catch (error) {
      this.log(`Failed to fetch patches: ${error.message}`, 'ERROR');
      throw error;
    }
  }

  extractComponent(text) {
    const lower = text.toLowerCase();
    if (lower.includes('clearpass')) return 'ClearPass';
    if (lower.includes('arubaos') || lower.includes('aos')) return 'ArubaOS';
    if (lower.includes('instant')) return 'Instant Access Points';
    if (lower.includes('central')) return 'Aruba Central';
    if (lower.includes('edgeconnect') || lower.includes('sd-wan')) return 'EdgeConnect SD-WAN';
    if (lower.includes('controller')) return 'Mobility Controller';
    return 'Aruba Products';
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const fetcher = new ArubaPatchFetcher();
  fetcher.fetchPatches().catch(console.error);
}

export default ArubaPatchFetcher;
