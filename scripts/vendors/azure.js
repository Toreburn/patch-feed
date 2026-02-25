import * as cheerio from 'cheerio';
import VendorPatchFetcher from '../vendor-fetch-template.js';
import { fileURLToPath } from 'url';

class AzurePatchFetcher extends VendorPatchFetcher {
  constructor() {
    super('azure');
  }

  async fetchPatches() {
    try {
      this.log('Starting Azure patch fetch via updates RSS feed');

      // Use the Azure updates RSS feed instead of scraping HTML
      const response = await this.fetchWithRetry(
        'https://azurecomcdn.azureedge.net/en-us/updates/feed/',
        {
          headers: {
            'User-Agent': 'PatchFeedBot/1.0',
            'Accept': 'application/xml, text/xml, application/rss+xml'
          }
        }
      );
      const $ = cheerio.load(response.data, { xmlMode: true });

      const cutoff = this.getSevenDaysAgo();
      const patches = [];

      $('item').each((i, item) => {
        const $item = $(item);
        const title = $item.find('title').text().trim();
        const link = $item.find('link').text().trim();
        const description = this.cleanHtml($item.find('description').text());
        const pubDate = new Date($item.find('pubDate').text());

        if (pubDate < cutoff) return;

        // Only include security-related updates
        const allText = (title + ' ' + description).toLowerCase();
        const securityKeywords = [
          'security', 'vulnerability', 'cve-', 'patch', 'advisory',
          'exploit', 'authentication', 'authorization', 'encryption',
          'compliance', 'threat', 'protection'
        ];
        if (!securityKeywords.some(kw => allText.includes(kw))) return;

        const cves = this.extractCVEs(title + ' ' + description);

        patches.push({
          title,
          date: pubDate.toISOString().split('T')[0],
          severity: this.getSeverityFromText(description),
          vendor: 'azure',
          component: title.split(':')[0].trim() || 'Azure',
          description: description.substring(0, 200) + (description.length > 200 ? '...' : ''),
          link,
          cve: cves[0] || ''
        });
      });

      this.log(`Found ${patches.length} Azure security updates from RSS feed`);
      return await this.updatePatchData(patches);
    } catch (error) {
      this.log(`Failed to fetch patches: ${error.message}`, 'ERROR');
      throw error;
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const fetcher = new AzurePatchFetcher();
  fetcher.fetchPatches().catch(console.error);
}

export default AzurePatchFetcher;
