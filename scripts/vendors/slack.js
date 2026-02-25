import * as cheerio from 'cheerio';
import VendorPatchFetcher from '../vendor-fetch-template.js';
import { fileURLToPath } from 'url';

class SlackPatchFetcher extends VendorPatchFetcher {
  constructor() {
    super('slack');
  }

  async fetchPatches() {
    try {
      this.log('Starting Slack patch fetch via changelog and security blog');

      const cutoff = this.getSevenDaysAgo();
      const patches = [];

      // Try Slack's engineering blog RSS for security posts
      try {
        const response = await this.fetchWithRetry(
          'https://slack.engineering/feed/'
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
            'security', 'vulnerability', 'cve-', 'patch', 'exploit',
            'authentication', 'authorization', 'xss', 'injection'
          ];
          if (!securityKeywords.some(kw => allText.includes(kw))) return;

          const cves = this.extractCVEs(title + ' ' + description);

          patches.push({
            title,
            date: pubDate.toISOString().split('T')[0],
            severity: this.getSeverityFromText(title + ' ' + description),
            vendor: 'slack',
            component: 'Slack',
            description: description.substring(0, 200) + (description.length > 200 ? '...' : ''),
            link,
            cve: cves[0] || ''
          });
        });
      } catch (e) {
        this.log(`Engineering blog fetch failed: ${e.message}`, 'WARN');
      }

      // Also check Slack's changelog page for security updates
      try {
        const changelogResp = await this.fetchWithRetry(
          'https://slack.com/changelog'
        );
        const $c = cheerio.load(changelogResp.data);

        $c('article, .changelog-entry, [class*="changelog"]').each((i, el) => {
          const $el = $c(el);
          const title = $el.find('h2, h3, .title').first().text().trim();
          const description = $el.find('p, .description, .body').first().text().trim();
          const dateText = $el.find('time, .date, [datetime]').first().attr('datetime') ||
                          $el.find('time, .date').first().text().trim();

          if (!title || !dateText) return;

          const pubDate = new Date(dateText);
          if (isNaN(pubDate.getTime()) || pubDate < cutoff) return;

          const allText = (title + ' ' + description).toLowerCase();
          if (!allText.includes('security') && !allText.includes('cve') && !allText.includes('vulnerability')) return;

          patches.push({
            title: `Slack: ${title}`,
            date: pubDate.toISOString().split('T')[0],
            severity: this.getSeverityFromText(title + ' ' + description),
            vendor: 'slack',
            component: 'Slack',
            description: description.substring(0, 200) + (description.length > 200 ? '...' : ''),
            link: 'https://slack.com/changelog'
          });
        });
      } catch (e) {
        this.log(`Changelog fetch failed: ${e.message}`, 'WARN');
      }

      this.log(`Found ${patches.length} Slack security updates`);
      return await this.updatePatchData(patches);
    } catch (error) {
      this.log(`Failed to fetch patches: ${error.message}`, 'ERROR');
      throw error;
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const fetcher = new SlackPatchFetcher();
  fetcher.fetchPatches().catch(console.error);
}

export default SlackPatchFetcher;
