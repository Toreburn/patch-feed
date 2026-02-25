import VendorPatchFetcher from '../vendor-fetch-template.js';
import { fileURLToPath } from 'url';

class FirefoxPatchFetcher extends VendorPatchFetcher {
  constructor() {
    super('firefox');
  }

  async fetchPatches() {
    try {
      this.log('Starting Firefox patch fetch via Mozilla CVE JSON feed');

      const response = await this.fetchWithRetry(
        'https://www.mozilla.org/en-US/security/advisories/cve-feed.json',
        { headers: { 'Accept': 'application/json' }, timeout: 30000 }
      );

      const cutoff = this.getSevenDaysAgo();
      const items = response.data || [];
      const patches = [];

      for (const item of items) {
        const pubDate = new Date(item.date || item.published || '');
        if (isNaN(pubDate.getTime()) || pubDate < cutoff) continue;

        // Only include Firefox-related items (skip Thunderbird-only)
        const title = item.title || item.id || '';
        const desc = item.description || '';
        const allText = (title + ' ' + desc).toLowerCase();
        if (!allText.includes('firefox') && !allText.includes('mozilla')) continue;

        const cves = this.extractCVEs(title + ' ' + desc);

        patches.push({
          title: title || `Mozilla Security Advisory: ${item.id || 'Unknown'}`,
          date: pubDate.toISOString().split('T')[0],
          severity: this.getSeverityFromText(item.severity || desc),
          vendor: 'firefox',
          component: allText.includes('thunderbird') ? 'Firefox & Thunderbird' : 'Firefox Browser',
          description: desc.substring(0, 200) + (desc.length > 200 ? '...' : ''),
          link: item.url || item.link || `https://www.mozilla.org/en-US/security/advisories/`,
          cve: cves[0] || ''
        });
      }

      this.log(`Found ${patches.length} Firefox security advisories`);
      return await this.updatePatchData(patches);
    } catch (error) {
      this.log(`Failed to fetch patches: ${error.message}`, 'ERROR');
      throw error;
    }
  }
}

export default FirefoxPatchFetcher;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const fetcher = new FirefoxPatchFetcher();
  fetcher.fetchPatches().catch(console.error);
}
