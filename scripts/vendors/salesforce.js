import * as cheerio from 'cheerio';
import VendorPatchFetcher from '../vendor-fetch-template.js';
import { fileURLToPath } from 'url';

class SalesforcePatchFetcher extends VendorPatchFetcher {
  constructor() {
    super('salesforce');
  }

  async fetchPatches() {
    try {
      this.log('Starting Salesforce patch fetch via Trust RSS feeds');
      const cutoff = this.getSevenDaysAgo();
      const patches = [];

      // Fetch from Salesforce Trust Security Advisories
      const advisoryResp = await this.fetchWithRetry(
        'https://trust.salesforce.com/security/advisories/feed'
      );
      const $adv = cheerio.load(advisoryResp.data, { xmlMode: true });

      $adv('item').each((i, item) => {
        const $item = $adv(item);
        const title = $item.find('title').text().trim();
        const link = $item.find('link').text().trim();
        const description = this.cleanHtml($item.find('description').text());
        const pubDate = new Date($item.find('pubDate').text());

        if (pubDate < cutoff) return;

        const cves = this.extractCVEs(title + ' ' + description);

        patches.push({
          title: `Salesforce Security Advisory: ${title}`,
          date: pubDate.toISOString().split('T')[0],
          severity: this.getSeverityFromText(description),
          vendor: 'salesforce',
          component: this.extractComponent(description),
          description: description.substring(0, 200) + (description.length > 200 ? '...' : ''),
          link,
          cve: cves[0] || ''
        });
      });

      // Fetch from Salesforce Trust Security Updates
      try {
        const updatesResp = await this.fetchWithRetry(
          'https://trust.salesforce.com/security/updates/feed'
        );
        const $upd = cheerio.load(updatesResp.data, { xmlMode: true });

        $upd('item').each((i, item) => {
          const $item = $upd(item);
          const title = $item.find('title').text().trim();
          const link = $item.find('link').text().trim();
          const description = this.cleanHtml($item.find('description').text());
          const pubDate = new Date($item.find('pubDate').text());

          if (pubDate < cutoff) return;

          patches.push({
            title: `Salesforce Security Update: ${title}`,
            date: pubDate.toISOString().split('T')[0],
            severity: this.getSeverityFromText(description),
            vendor: 'salesforce',
            component: this.extractComponent(description),
            description: description.substring(0, 200) + (description.length > 200 ? '...' : ''),
            link
          });
        });
      } catch (err) {
        this.log(`Updates feed failed (non-fatal): ${err.message}`, 'WARN');
      }

      this.log(`Found ${patches.length} items from Salesforce Trust feeds`);
      return await this.updatePatchData(patches);
    } catch (error) {
      this.log(`Failed to fetch patches: ${error.message}`, 'ERROR');
      throw error;
    }
  }

  extractComponent(text) {
    const components = [
      'Sales Cloud', 'Service Cloud', 'Marketing Cloud', 'Commerce Cloud',
      'Platform', 'Analytics Cloud', 'Experience Cloud',
      'Heroku', 'MuleSoft', 'Tableau', 'Slack',
      'Field Service', 'Einstein', 'AppExchange'
    ];
    const lower = text.toLowerCase();
    for (const component of components) {
      if (lower.includes(component.toLowerCase())) return component;
    }
    return 'Salesforce Products';
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const fetcher = new SalesforcePatchFetcher();
  fetcher.fetchPatches().catch(console.error);
}

export default SalesforcePatchFetcher;
