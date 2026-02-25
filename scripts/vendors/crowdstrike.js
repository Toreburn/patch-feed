import * as cheerio from 'cheerio';
import VendorPatchFetcher from '../vendor-fetch-template.js';
import { fileURLToPath } from 'url';

class CrowdStrikePatchFetcher extends VendorPatchFetcher {
  constructor() {
    super('crowdstrike');
  }

  async fetchPatches() {
    try {
      this.log('Starting CrowdStrike patch fetch via blog RSS and NVD');

      const cutoff = this.getSevenDaysAgo();
      const patches = [];

      // CrowdStrike publishes security info on their blog
      try {
        const response = await this.fetchWithRetry(
          'https://www.crowdstrike.com/blog/feed/'
        );
        const $ = cheerio.load(response.data, { xmlMode: true });

        $('item').each((i, item) => {
          const $item = $(item);
          const title = $item.find('title').text().trim();
          const link = $item.find('link').text().trim();
          const description = this.cleanHtml(
            $item.find('content\\:encoded').text() || $item.find('description').text() || ''
          );
          const pubDate = new Date($item.find('pubDate').text());

          if (isNaN(pubDate.getTime()) || pubDate < cutoff) return;

          const allText = (title + ' ' + description).toLowerCase();
          const securityKeywords = [
            'vulnerability', 'cve-', 'advisory', 'patch', 'security update',
            'exploit', 'hotfix', 'sensor update', 'falcon'
          ];
          if (!securityKeywords.some(kw => allText.includes(kw))) return;

          const cves = this.extractCVEs(title + ' ' + description);

          patches.push({
            title,
            date: pubDate.toISOString().split('T')[0],
            severity: this.getSeverityFromText(title + ' ' + description),
            vendor: 'crowdstrike',
            component: this.extractComponent(title + ' ' + description),
            description: description.substring(0, 200) + (description.length > 200 ? '...' : ''),
            link,
            cve: cves[0] || ''
          });
        });
      } catch (e) {
        this.log(`Blog RSS fetch failed: ${e.message}`, 'WARN');
      }

      this.log(`Found ${patches.length} CrowdStrike security advisories`);
      return await this.updatePatchData(patches);
    } catch (error) {
      this.log(`Failed to fetch patches: ${error.message}`, 'ERROR');
      throw error;
    }
  }

  extractComponent(text) {
    const lower = text.toLowerCase();
    if (lower.includes('falcon sensor') || lower.includes('sensor')) return 'Falcon Sensor';
    if (lower.includes('falcon platform')) return 'Falcon Platform';
    if (lower.includes('falcon insight')) return 'Falcon Insight';
    if (lower.includes('falcon prevent')) return 'Falcon Prevent';
    if (lower.includes('falcon overwatch')) return 'Falcon OverWatch';
    return 'CrowdStrike Falcon';
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const fetcher = new CrowdStrikePatchFetcher();
  fetcher.fetchPatches().catch(console.error);
}

export default CrowdStrikePatchFetcher;
