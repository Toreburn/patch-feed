import * as cheerio from 'cheerio';
import VendorPatchFetcher from '../vendor-fetch-template.js';
import { fileURLToPath } from 'url';

class CheckPointPatchFetcher extends VendorPatchFetcher {
  constructor() {
    super('checkpoint');
  }

  async fetchPatches() {
    try {
      this.log('Starting Check Point patch fetch via advisories page');

      const response = await this.fetchWithRetry(
        'https://advisories.checkpoint.com/advisories/',
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html'
          }
        }
      );
      const $ = cheerio.load(response.data);

      const cutoff = this.getSevenDaysAgo();
      const patches = [];

      // Check Point lists advisories in tables or card formats
      $('table tbody tr').each((i, row) => {
        const $row = $(row);
        const cells = $row.find('td');
        if (cells.length < 2) return;

        const $link = $row.find('a[href]').first();
        const title = $link.text().trim() || $(cells[0]).text().trim();
        const href = $link.attr('href') || '';

        if (!title || title.length < 5) return;

        // Find date
        let pubDate = null;
        cells.each((j, cell) => {
          const text = $(cell).text().trim();
          const dateMatch = text.match(/\d{4}-\d{2}-\d{2}/) ||
            text.match(/(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}/i);
          if (dateMatch) {
            const d = new Date(dateMatch[0]);
            if (!isNaN(d.getTime())) pubDate = d;
          }
        });

        if (!pubDate || pubDate < cutoff) return;

        // Find severity
        let severity = 'UNKNOWN';
        const rowText = $row.text().toLowerCase();
        if (rowText.includes('critical')) severity = 'CRITICAL';
        else if (rowText.includes('high')) severity = 'HIGH';
        else if (rowText.includes('medium')) severity = 'MEDIUM';
        else if (rowText.includes('low')) severity = 'LOW';

        const link = href.startsWith('http') ? href : `https://advisories.checkpoint.com${href}`;
        const cves = this.extractCVEs($row.text());

        patches.push({
          title,
          date: pubDate.toISOString().split('T')[0],
          severity,
          vendor: 'checkpoint',
          component: this.extractComponent(title),
          description: `Check Point advisory: ${title}`,
          link,
          cve: cves[0] || ''
        });
      });

      // Fallback: link-based discovery
      if (patches.length === 0) {
        $('a[href*="advisories"]').each((i, el) => {
          const $a = $(el);
          const title = $a.text().trim();
          const href = $a.attr('href') || '';

          if (!title || title.length < 10 || !href.includes('cpai-') && !href.includes('check-point')) return;

          const parentText = $a.closest('div, tr, li, article').text();
          const dateMatch = parentText.match(/\d{4}-\d{2}-\d{2}/) ||
            parentText.match(/(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}/i);

          const pubDate = dateMatch ? new Date(dateMatch[0]) : null;
          if (!pubDate || isNaN(pubDate.getTime()) || pubDate < cutoff) return;

          const link = href.startsWith('http') ? href : `https://advisories.checkpoint.com${href}`;

          patches.push({
            title,
            date: pubDate.toISOString().split('T')[0],
            severity: this.getSeverityFromText(parentText),
            vendor: 'checkpoint',
            component: this.extractComponent(title),
            description: `Check Point advisory: ${title}`,
            link
          });
        });
      }

      this.log(`Found ${patches.length} Check Point advisories`);
      return await this.updatePatchData(patches);
    } catch (error) {
      this.log(`Failed to fetch patches: ${error.message}`, 'ERROR');
      throw error;
    }
  }

  extractComponent(title) {
    const products = [
      'Security Gateway', 'Quantum', 'CloudGuard',
      'Infinity', 'Harmony Endpoint', 'Harmony',
      'Management Server', 'SmartConsole',
      'VSX', 'Endpoint Security', 'Mobile Security',
      'SandBlast', 'Gaia', 'ZoneAlarm'
    ];
    const lower = title.toLowerCase();
    for (const product of products) {
      if (lower.includes(product.toLowerCase())) return product;
    }
    return 'Check Point Products';
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const fetcher = new CheckPointPatchFetcher();
  fetcher.fetchPatches().catch(console.error);
}

export default CheckPointPatchFetcher;
