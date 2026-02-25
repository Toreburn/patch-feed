import * as cheerio from 'cheerio';
import VendorPatchFetcher from '../vendor-fetch-template.js';
import { fileURLToPath } from 'url';

class AndroidPatchFetcher extends VendorPatchFetcher {
  constructor() {
    super('android');
  }

  async fetchPatches() {
    try {
      this.log('Starting Android patch fetch via security bulletin page');

      const response = await this.fetchWithRetry(
        'https://source.android.com/docs/security/bulletin'
      );
      const $ = cheerio.load(response.data);

      const cutoff = this.getSevenDaysAgo();
      const patches = [];

      // Android bulletins are listed as links on the index page
      $('a[href*="/docs/security/bulletin/"]').each((i, el) => {
        const $a = $(el);
        const title = $a.text().trim();
        const href = $a.attr('href') || '';

        // Skip non-bulletin links (like the index itself)
        if (!title || title.length < 5) return;
        if (href === '/docs/security/bulletin' || href === '/docs/security/bulletin/') return;

        // Try to extract date from the bulletin title or URL
        // Titles are like "Android Security Bulletin—February 2026"
        // URLs are like "/docs/security/bulletin/2026-02-01"
        const urlDateMatch = href.match(/(\d{4}-\d{2})-\d{2}$/);
        const titleDateMatch = title.match(/(\w+)\s+(\d{4})/);

        let pubDate = null;
        if (urlDateMatch) {
          pubDate = new Date(urlDateMatch[1] + '-01');
        } else if (titleDateMatch) {
          const monthStr = titleDateMatch[1];
          const year = titleDateMatch[2];
          const monthMap = {
            january: '01', february: '02', march: '03', april: '04',
            may: '05', june: '06', july: '07', august: '08',
            september: '09', october: '10', november: '11', december: '12'
          };
          const month = monthMap[monthStr.toLowerCase()];
          if (month) pubDate = new Date(`${year}-${month}-01`);
        }

        if (!pubDate || isNaN(pubDate.getTime()) || pubDate < cutoff) return;

        const fullLink = href.startsWith('http')
          ? href
          : `https://source.android.com${href}`;

        patches.push({
          title: title.includes('Android') ? title : `Android Security Bulletin: ${title}`,
          date: pubDate.toISOString().split('T')[0],
          severity: 'HIGH', // Android bulletins are typically high severity
          vendor: 'android',
          component: 'Android OS',
          description: `Monthly Android security bulletin addressing multiple vulnerabilities in the Android platform and components.`,
          link: fullLink
        });
      });

      this.log(`Found ${patches.length} Android security bulletins`);
      return await this.updatePatchData(patches);
    } catch (error) {
      this.log(`Failed to fetch patches: ${error.message}`, 'ERROR');
      throw error;
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const fetcher = new AndroidPatchFetcher();
  fetcher.fetchPatches().catch(console.error);
}

export default AndroidPatchFetcher;
