import * as cheerio from 'cheerio';
import VendorPatchFetcher from '../vendor-fetch-template.js';
import { fileURLToPath } from 'url';

class ZoomPatchFetcher extends VendorPatchFetcher {
  constructor() {
    super('zoom');
  }

  async fetchPatches() {
    try {
      this.log('Starting Zoom patch fetch via security bulletin page');

      const response = await this.fetchWithRetry(
        'https://www.zoom.com/en/trust/security-bulletin/',
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

      // Zoom security bulletins are listed in a table or card layout
      // Try table rows first
      $('table tbody tr').each((i, row) => {
        const $row = $(row);
        const cells = $row.find('td');
        if (cells.length < 2) return;

        const $link = $row.find('a[href]').first();
        const title = $link.text().trim() || $(cells[0]).text().trim();
        const href = $link.attr('href') || '';

        if (!title || title.length < 5) return;

        // Find date (typically in one of the cells)
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

        // Find severity in cells
        let severity = 'UNKNOWN';
        cells.each((j, cell) => {
          const text = $(cell).text().trim().toLowerCase();
          if (['critical', 'high', 'medium', 'low'].includes(text)) {
            severity = text.toUpperCase();
          }
        });

        const link = href.startsWith('http') ? href :
          (href.startsWith('/') ? `https://www.zoom.com${href}` : href);
        const cves = this.extractCVEs(title + ' ' + $row.text());

        patches.push({
          title,
          date: pubDate.toISOString().split('T')[0],
          severity,
          vendor: 'zoom',
          component: this.extractComponent(title),
          description: `Zoom security bulletin: ${title}`,
          link,
          cve: cves[0] || ''
        });
      });

      // Fallback: look for structured card/list items
      if (patches.length === 0) {
        $('a[href*="/security-bulletin/"]').each((i, el) => {
          const $a = $(el);
          const title = $a.text().trim();
          const href = $a.attr('href') || '';

          if (!title || title.length < 5) return;

          const parentText = $a.closest('div, tr, li').text();
          const dateMatch = parentText.match(/\d{4}-\d{2}-\d{2}/) ||
            parentText.match(/(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}/i);

          const pubDate = dateMatch ? new Date(dateMatch[0]) : null;
          if (!pubDate || isNaN(pubDate.getTime()) || pubDate < cutoff) return;

          const link = href.startsWith('http') ? href :
            (href.startsWith('/') ? `https://www.zoom.com${href}` : href);

          patches.push({
            title,
            date: pubDate.toISOString().split('T')[0],
            severity: this.getSeverityFromText(parentText),
            vendor: 'zoom',
            component: this.extractComponent(title),
            description: `Zoom security bulletin: ${title}`,
            link
          });
        });
      }

      this.log(`Found ${patches.length} Zoom security bulletins`);
      return await this.updatePatchData(patches);
    } catch (error) {
      this.log(`Failed to fetch patches: ${error.message}`, 'ERROR');
      throw error;
    }
  }

  extractComponent(title) {
    const products = [
      'Zoom Workplace', 'Zoom Rooms', 'Zoom SDK',
      'Zoom Client', 'Zoom Meetings', 'Zoom Phone',
      'Zoom Chat', 'Zoom Webinars', 'Zoom Events',
      'Zoom Contact Center', 'Zoom VDI'
    ];
    const lower = title.toLowerCase();
    for (const product of products) {
      if (lower.includes(product.toLowerCase())) return product;
    }
    return 'Zoom';
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const fetcher = new ZoomPatchFetcher();
  fetcher.fetchPatches().catch(console.error);
}

export default ZoomPatchFetcher;
