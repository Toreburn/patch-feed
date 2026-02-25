import * as cheerio from 'cheerio';
import VendorPatchFetcher from '../vendor-fetch-template.js';
import { fileURLToPath } from 'url';

class AdobePatchFetcher extends VendorPatchFetcher {
  constructor() {
    super('adobe');
  }

  async fetchPatches() {
    try {
      this.log('Starting Adobe patch fetch via security bulletin page');

      const response = await this.fetchWithRetry(
        'https://helpx.adobe.com/security/security-bulletin.html',
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

      // Adobe bulletin page lists advisories in tables or structured divs
      // Try multiple selectors for different page structures
      $('table tbody tr, .dexter-Table tbody tr, .table tbody tr').each((i, row) => {
        const $row = $(row);
        const cells = $row.find('td');
        if (cells.length < 2) return;

        const $link = $row.find('a[href]').first();
        const title = $link.text().trim() || $(cells[0]).text().trim();
        const href = $link.attr('href') || '';
        const dateText = $(cells[cells.length - 1]).text().trim() ||
                         $(cells[1]).text().trim();

        if (!title || title.length < 5) return;

        // Parse date (formats: "February 11, 2026" or "2026-02-11")
        const pubDate = new Date(dateText);
        if (isNaN(pubDate.getTime()) || pubDate < cutoff) return;

        const link = href.startsWith('http') ? href : `https://helpx.adobe.com${href}`;
        const cves = this.extractCVEs(title);

        patches.push({
          title,
          date: pubDate.toISOString().split('T')[0],
          severity: this.getSeverityFromText(title),
          vendor: 'adobe',
          component: this.extractComponent(title),
          description: `Adobe security bulletin: ${title}`,
          link,
          cve: cves[0] || ''
        });
      });

      // Also try link-based discovery
      if (patches.length === 0) {
        $('a[href*="/security/products/"]').each((i, el) => {
          const $a = $(el);
          const title = $a.text().trim();
          const href = $a.attr('href') || '';

          if (!title || title.length < 5) return;

          // Look for date in parent/sibling text
          const parentText = $a.parent().text() + ' ' + $a.parent().parent().text();
          const dateMatch = parentText.match(
            /(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}/i
          ) || parentText.match(/\d{4}-\d{2}-\d{2}/);

          const pubDate = dateMatch ? new Date(dateMatch[0]) : null;
          if (!pubDate || isNaN(pubDate.getTime()) || pubDate < cutoff) return;

          const link = href.startsWith('http') ? href : `https://helpx.adobe.com${href}`;

          patches.push({
            title,
            date: pubDate.toISOString().split('T')[0],
            severity: this.getSeverityFromText(title),
            vendor: 'adobe',
            component: this.extractComponent(title),
            description: `Adobe security bulletin: ${title}`,
            link
          });
        });
      }

      this.log(`Found ${patches.length} Adobe security bulletins`);
      return await this.updatePatchData(patches);
    } catch (error) {
      this.log(`Failed to fetch patches: ${error.message}`, 'ERROR');
      throw error;
    }
  }

  extractComponent(title) {
    const products = [
      'Acrobat Reader', 'Acrobat', 'Photoshop', 'Illustrator', 'InDesign',
      'Premiere Pro', 'After Effects', 'Creative Cloud', 'ColdFusion',
      'Commerce', 'Experience Manager', 'Magento', 'Animate',
      'Bridge', 'Lightroom', 'Dimension', 'Framemaker',
      'Substance 3D', 'Media Encoder', 'Connect'
    ];
    const lower = title.toLowerCase();
    for (const product of products) {
      if (lower.includes(product.toLowerCase())) return product;
    }
    return 'Adobe Products';
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const fetcher = new AdobePatchFetcher();
  fetcher.fetchPatches().catch(console.error);
}

export default AdobePatchFetcher;
