import * as cheerio from 'cheerio';
import VendorPatchFetcher from '../vendor-fetch-template.js';
import { fileURLToPath } from 'url';

class AtlassianPatchFetcher extends VendorPatchFetcher {
  constructor() {
    super('atlassian');
  }

  async fetchPatches() {
    try {
      this.log('Starting Atlassian patch fetch via security advisories page');

      // Atlassian publishes advisories at this page; scrape the actual structure
      const response = await this.fetchWithRetry(
        'https://confluence.atlassian.com/security/feed'
      );
      const $ = cheerio.load(response.data, { xmlMode: true });

      const cutoff = this.getSevenDaysAgo();
      const patches = [];

      // Try RSS/Atom format first
      const items = $('item').length ? $('item') : $('entry');

      items.each((i, item) => {
        const $item = $(item);
        const title = ($item.find('title').text() || '').trim();
        const link = $item.find('link').text().trim() ||
                     $item.find('link').attr('href') || '';
        const description = this.cleanHtml(
          $item.find('description').text() ||
          $item.find('summary').text() ||
          $item.find('content').text() || ''
        );
        const pubDate = new Date(
          $item.find('pubDate').text() ||
          $item.find('published').text() ||
          $item.find('updated').text() || ''
        );

        if (isNaN(pubDate.getTime()) || pubDate < cutoff) return;

        const cves = this.extractCVEs(title + ' ' + description);

        patches.push({
          title: title.startsWith('Atlassian') ? title : `Atlassian Advisory: ${title}`,
          date: pubDate.toISOString().split('T')[0],
          severity: this.getSeverityFromText(title + ' ' + description),
          vendor: 'atlassian',
          component: this.extractComponent(title + ' ' + description),
          description: description.substring(0, 200) + (description.length > 200 ? '...' : ''),
          link,
          cve: cves[0] || ''
        });
      });

      // Fallback: scrape the HTML advisories page if RSS returned nothing
      if (patches.length === 0) {
        this.log('RSS feed empty, trying HTML advisories page');
        const htmlResp = await this.fetchWithRetry(
          'https://confluence.atlassian.com/security'
        );
        const $h = cheerio.load(htmlResp.data);

        $h('a[href*="/security/"]').each((i, el) => {
          const $a = $h(el);
          const title = $a.text().trim();
          const href = $a.attr('href') || '';

          if (!title || title.length < 10) return;

          // Look for date in nearby text
          const parentText = $a.parent().text();
          const dateMatch = parentText.match(/(\d{4}-\d{2}-\d{2})/);
          const pubDate = dateMatch ? new Date(dateMatch[1]) : null;

          if (!pubDate || pubDate < cutoff) return;

          const fullLink = href.startsWith('http') ? href : `https://confluence.atlassian.com${href}`;

          patches.push({
            title: title.startsWith('Atlassian') ? title : `Atlassian Advisory: ${title}`,
            date: pubDate.toISOString().split('T')[0],
            severity: this.getSeverityFromText(title),
            vendor: 'atlassian',
            component: this.extractComponent(title),
            description: title,
            link: fullLink
          });
        });
      }

      this.log(`Found ${patches.length} advisories from Atlassian`);
      return await this.updatePatchData(patches);
    } catch (error) {
      this.log(`Failed to fetch patches: ${error.message}`, 'ERROR');
      throw error;
    }
  }

  extractComponent(text) {
    const components = [
      'Jira', 'Confluence', 'Bitbucket', 'Bamboo',
      'Crowd', 'Fisheye', 'Crucible', 'Sourcetree',
      'Trello', 'Statuspage', 'Opsgenie'
    ];
    const lower = text.toLowerCase();
    for (const component of components) {
      if (lower.includes(component.toLowerCase())) return component;
    }
    return 'Atlassian Products';
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const fetcher = new AtlassianPatchFetcher();
  fetcher.fetchPatches().catch(console.error);
}

export default AtlassianPatchFetcher;
