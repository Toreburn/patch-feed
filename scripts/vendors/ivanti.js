import * as cheerio from 'cheerio';
import VendorPatchFetcher from '../vendor-fetch-template.js';
import { fileURLToPath } from 'url';

class IvantiPatchFetcher extends VendorPatchFetcher {
  constructor() {
    super('ivanti');
  }

  async fetchPatches() {
    try {
      this.log('Starting Ivanti patch fetch via security advisories page');

      const cutoff = this.getSevenDaysAgo();
      const patches = [];

      // Ivanti publishes security advisories on their forums/security page
      const response = await this.fetchWithRetry(
        'https://www.ivanti.com/blog/topics/security-advisory'
      );
      const $ = cheerio.load(response.data);

      // Parse blog-style advisory listings
      $('article, .blog-post, .card, [class*="post"], [class*="article"]').each((i, el) => {
        const $el = $(el);
        const title = $el.find('h2, h3, .title, [class*="title"]').first().text().trim();
        const link = $el.find('a').first().attr('href') || '';
        const description = $el.find('p, .excerpt, .summary, [class*="desc"]').first().text().trim();
        const dateText = $el.find('time, .date, [datetime], [class*="date"]').first().attr('datetime') ||
                        $el.find('time, .date, [class*="date"]').first().text().trim();

        if (!title || title.length < 5) return;

        let pubDate = null;
        if (dateText) {
          pubDate = new Date(dateText);
        }

        if (!pubDate || isNaN(pubDate.getTime()) || pubDate < cutoff) return;

        const fullLink = link.startsWith('http') ? link : `https://www.ivanti.com${link}`;
        const cves = this.extractCVEs(title + ' ' + description);

        patches.push({
          title: title.includes('Ivanti') ? title : `Ivanti: ${title}`,
          date: pubDate.toISOString().split('T')[0],
          severity: this.getSeverityFromText(title + ' ' + description),
          vendor: 'ivanti',
          component: this.extractComponent(title + ' ' + description),
          description: (description || title).substring(0, 200) + ((description || title).length > 200 ? '...' : ''),
          link: fullLink,
          cve: cves[0] || '',
          cves
        });
      });

      this.log(`Found ${patches.length} Ivanti security advisories`);
      return await this.updatePatchData(patches);
    } catch (error) {
      this.log(`Failed to fetch patches: ${error.message}`, 'ERROR');
      throw error;
    }
  }

  extractComponent(text) {
    const lower = text.toLowerCase();
    if (lower.includes('connect secure') || lower.includes('ics')) return 'Connect Secure';
    if (lower.includes('policy secure')) return 'Policy Secure';
    if (lower.includes('epmm') || lower.includes('mobileiron')) return 'EPMM (MobileIron)';
    if (lower.includes('neurons')) return 'Neurons';
    if (lower.includes('avalanche')) return 'Avalanche';
    if (lower.includes('sentry')) return 'Sentry';
    if (lower.includes('endpoint manager') || lower.includes('epm')) return 'Endpoint Manager';
    if (lower.includes('workspace control')) return 'Workspace Control';
    return 'Ivanti Products';
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const fetcher = new IvantiPatchFetcher();
  fetcher.fetchPatches().catch(console.error);
}

export default IvantiPatchFetcher;
