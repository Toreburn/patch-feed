import * as cheerio from 'cheerio';
import VendorPatchFetcher from '../vendor-fetch-template.js';
import { fileURLToPath } from 'url';

class JuniperPatchFetcher extends VendorPatchFetcher {
  constructor() {
    super('juniper');
  }

  async fetchPatches() {
    try {
      this.log('Starting Juniper patch fetch via advisory page');

      const response = await this.fetchWithRetry(
        'https://advisory.juniper.net/',
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

      // Juniper lists advisories in tables
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

        // Find severity/CVSS
        let severity = 'UNKNOWN';
        const rowText = $row.text();
        const cvssMatch = rowText.match(/(\d+\.\d+)/);
        if (cvssMatch) {
          const score = parseFloat(cvssMatch[1]);
          if (score >= 9) severity = 'CRITICAL';
          else if (score >= 7) severity = 'HIGH';
          else if (score >= 4) severity = 'MEDIUM';
          else if (score > 0) severity = 'LOW';
        } else {
          severity = this.getSeverityFromText(rowText);
        }

        const link = href.startsWith('http') ? href : `https://advisory.juniper.net${href}`;
        const cves = this.extractCVEs(rowText);

        patches.push({
          title,
          date: pubDate.toISOString().split('T')[0],
          severity,
          vendor: 'juniper',
          component: this.extractComponent(title),
          description: `Juniper security advisory: ${title}`,
          link,
          cve: cves[0] || ''
        });
      });

      // Fallback: link-based discovery
      if (patches.length === 0) {
        $('a[href*="JSA"], a[href*="advisory"]').each((i, el) => {
          const $a = $(el);
          const title = $a.text().trim();
          const href = $a.attr('href') || '';

          if (!title || title.length < 10) return;

          const parentText = $a.closest('div, tr, li, article').text();
          const dateMatch = parentText.match(/\d{4}-\d{2}-\d{2}/) ||
            parentText.match(/(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}/i);

          const pubDate = dateMatch ? new Date(dateMatch[0]) : null;
          if (!pubDate || isNaN(pubDate.getTime()) || pubDate < cutoff) return;

          const link = href.startsWith('http') ? href : `https://advisory.juniper.net${href}`;

          patches.push({
            title,
            date: pubDate.toISOString().split('T')[0],
            severity: this.getSeverityFromText(parentText),
            vendor: 'juniper',
            component: this.extractComponent(title),
            description: `Juniper security advisory: ${title}`,
            link
          });
        });
      }

      this.log(`Found ${patches.length} Juniper security advisories`);
      return await this.updatePatchData(patches);
    } catch (error) {
      this.log(`Failed to fetch patches: ${error.message}`, 'ERROR');
      throw error;
    }
  }

  extractComponent(title) {
    const lower = title.toLowerCase();
    if (lower.includes('junos os') || lower.includes('junos')) return 'Junos OS';
    if (lower.includes('srx')) return 'SRX Series';
    if (lower.includes(' mx ') || lower.includes('mx series')) return 'MX Series';
    if (lower.includes(' ex ') || lower.includes('ex series')) return 'EX Series';
    if (lower.includes('qfx')) return 'QFX Series';
    if (lower.includes('contrail')) return 'Contrail';
    if (lower.includes('mist')) return 'Mist';
    if (lower.includes('space')) return 'Junos Space';
    return 'Juniper Products';
  }
}

export default JuniperPatchFetcher;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const fetcher = new JuniperPatchFetcher();
  fetcher.fetchPatches().catch(console.error);
}
