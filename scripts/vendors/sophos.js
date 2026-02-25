import * as cheerio from 'cheerio';
import VendorPatchFetcher from '../vendor-fetch-template.js';
import { fileURLToPath } from 'url';

class SophosPatchFetcher extends VendorPatchFetcher {
  constructor() {
    super('sophos');
  }

  async fetchPatches() {
    try {
      this.log('Starting Sophos patch fetch via news RSS (security filter)');

      const response = await this.fetchWithRetry(
        'https://news.sophos.com/en-us/feed/'
      );
      const $ = cheerio.load(response.data, { xmlMode: true });

      const cutoff = this.getSevenDaysAgo();
      const patches = [];

      $('item').each((i, item) => {
        const $item = $(item);
        const title = $item.find('title').text().trim();
        const link = $item.find('link').text().trim();
        const description = this.cleanHtml(
          $item.find('content\\:encoded').text() || $item.find('description').text()
        );
        const pubDate = new Date($item.find('pubDate').text());

        // Collect categories to check for security relevance
        const categories = [];
        $item.find('category').each((j, cat) => {
          categories.push($(cat).text().toLowerCase());
        });
        const allText = (title + ' ' + description + ' ' + categories.join(' ')).toLowerCase();

        // Only include security-related posts
        const securityKeywords = [
          'security', 'vulnerability', 'cve-', 'advisory', 'patch',
          'exploit', 'firewall', 'xg', 'sg', 'intercept', 'endpoint',
          'hotfix', 'rce', 'authentication bypass'
        ];
        if (!securityKeywords.some(kw => allText.includes(kw))) return;

        if (pubDate < cutoff) return;

        const cves = this.extractCVEs(title + ' ' + description);

        patches.push({
          title,
          date: pubDate.toISOString().split('T')[0],
          severity: this.getSeverityFromText(title + ' ' + description),
          vendor: 'sophos',
          component: this.extractComponent(title + ' ' + description),
          description: description.substring(0, 200) + (description.length > 200 ? '...' : ''),
          link,
          cve: cves[0] || ''
        });
      });

      this.log(`Found ${patches.length} security posts from Sophos RSS`);
      return await this.updatePatchData(patches);
    } catch (error) {
      this.log(`Failed to fetch patches: ${error.message}`, 'ERROR');
      throw error;
    }
  }

  extractComponent(text) {
    const products = [
      'Sophos Firewall', 'XG Firewall', 'SG UTM',
      'Intercept X', 'Endpoint', 'Central',
      'Mobile', 'Email', 'Web Appliance',
      'SafeGuard', 'Phish Threat', 'Cloud Optix'
    ];
    const lower = text.toLowerCase();
    for (const product of products) {
      if (lower.includes(product.toLowerCase())) return product;
    }
    return 'Sophos Products';
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const fetcher = new SophosPatchFetcher();
  fetcher.fetchPatches().catch(console.error);
}

export default SophosPatchFetcher;
