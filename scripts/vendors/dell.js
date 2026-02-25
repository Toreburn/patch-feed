import * as cheerio from 'cheerio';
import VendorPatchFetcher from '../vendor-fetch-template.js';
import { fileURLToPath } from 'url';

class DellPatchFetcher extends VendorPatchFetcher {
  constructor() {
    super('dell');
  }

  async fetchPatches() {
    try {
      this.log('Starting Dell patch fetch via security advisories and NVD');

      const cutoff = this.getSevenDaysAgo();
      const patches = [];

      // Dell publishes security advisories via their support site
      try {
        const response = await this.fetchWithRetry(
          'https://www.dell.com/support/security/en-us'
        );
        const $ = cheerio.load(response.data);

        $('table tr, a[href*="DSA"], a[href*="security"], [class*="advisory"]').each((i, el) => {
          const $el = $(el);
          const title = ($el.find('td').first().text() || $el.text() || '').trim();
          const href = $el.find('a').first().attr('href') || $el.attr('href') || '';

          if (!title || title.length < 10) return;

          const rowText = $el.text();
          const dateMatch = rowText.match(/(\d{4}-\d{2}-\d{2})/) ||
                           rowText.match(/(\d{2}\/\d{2}\/\d{4})/);

          let pubDate = null;
          if (dateMatch) pubDate = new Date(dateMatch[1]);

          if (!pubDate || isNaN(pubDate.getTime()) || pubDate < cutoff) return;

          const cves = this.extractCVEs(rowText);
          const fullLink = href.startsWith('http') ? href : `https://www.dell.com${href}`;

          patches.push({
            title: `Dell: ${title.substring(0, 120)}`,
            date: pubDate.toISOString().split('T')[0],
            severity: this.getSeverityFromText(rowText),
            vendor: 'dell',
            component: this.extractComponent(title),
            description: title.substring(0, 200),
            link: fullLink,
            cve: cves[0] || '',
            cves
          });
        });
      } catch (e) {
        this.log(`Dell support page fetch failed: ${e.message}`, 'WARN');
      }

      this.log(`Found ${patches.length} Dell security advisories`);
      return await this.updatePatchData(patches);
    } catch (error) {
      this.log(`Failed to fetch patches: ${error.message}`, 'ERROR');
      throw error;
    }
  }

  extractComponent(text) {
    const lower = text.toLowerCase();
    if (lower.includes('idrac')) return 'iDRAC';
    if (lower.includes('poweredge')) return 'PowerEdge';
    if (lower.includes('powerscale') || lower.includes('isilon')) return 'PowerScale';
    if (lower.includes('powerstore')) return 'PowerStore';
    if (lower.includes('unity')) return 'Unity';
    if (lower.includes('vxrail')) return 'VxRail';
    if (lower.includes('bios')) return 'BIOS/Firmware';
    if (lower.includes('openmanage')) return 'OpenManage';
    return 'Dell Products';
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const fetcher = new DellPatchFetcher();
  fetcher.fetchPatches().catch(console.error);
}

export default DellPatchFetcher;
