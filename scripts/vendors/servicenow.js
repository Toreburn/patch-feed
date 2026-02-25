import * as cheerio from 'cheerio';
import VendorPatchFetcher from '../vendor-fetch-template.js';
import { fileURLToPath } from 'url';

class ServicenowPatchFetcher extends VendorPatchFetcher {
  constructor() {
    super('servicenow');
  }

  async fetchPatches() {
    try {
      this.log('Starting ServiceNow patch fetch via security advisories page');

      const cutoff = this.getSevenDaysAgo();
      const patches = [];

      // ServiceNow publishes security advisories on their support site
      const response = await this.fetchWithRetry(
        'https://support.servicenow.com/kb?id=kb_article_view&sysparm_article=KB0604620'
      );
      const $ = cheerio.load(response.data);

      // Look for advisory links and tables on the page
      $('a[href*="advisory"], a[href*="security"], tr, .kb-article-content a').each((i, el) => {
        const $el = $(el);
        const title = $el.text().trim();
        const href = $el.attr('href') || '';

        if (!title || title.length < 10) return;

        // Look for date patterns in surrounding content
        const parentText = $el.parent().text() || '';
        const dateMatch = parentText.match(/(\d{4}-\d{2}-\d{2})/);
        const pubDate = dateMatch ? new Date(dateMatch[1]) : null;

        if (!pubDate || isNaN(pubDate.getTime()) || pubDate < cutoff) return;

        const allText = (title + ' ' + parentText).toLowerCase();
        if (!allText.includes('security') && !allText.includes('cve') && !allText.includes('advisory')) return;

        const cves = this.extractCVEs(title + ' ' + parentText);
        const fullLink = href.startsWith('http') ? href : `https://support.servicenow.com${href}`;

        patches.push({
          title: `ServiceNow: ${title.substring(0, 120)}`,
          date: pubDate.toISOString().split('T')[0],
          severity: this.getSeverityFromText(title + ' ' + parentText),
          vendor: 'servicenow',
          component: 'ServiceNow Platform',
          description: title.substring(0, 200),
          link: fullLink,
          cve: cves[0] || ''
        });
      });

      this.log(`Found ${patches.length} ServiceNow security advisories`);
      return await this.updatePatchData(patches);
    } catch (error) {
      this.log(`Failed to fetch patches: ${error.message}`, 'ERROR');
      throw error;
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const fetcher = new ServicenowPatchFetcher();
  fetcher.fetchPatches().catch(console.error);
}

export default ServicenowPatchFetcher;
