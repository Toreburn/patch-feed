import axios from 'axios';
import * as cheerio from 'cheerio';
import { fileURLToPath } from 'url';
import VendorPatchFetcher from '../vendor-fetch-template.js';

class GitLabPatchFetcher extends VendorPatchFetcher {
  constructor() {
    super('gitlab');
  }

  async fetchPatches() {
    try {
      this.log('Starting GitLab patch fetch via security releases RSS');

      // Fetch from GitLab Security Releases Atom feed
      const response = await axios.get('https://about.gitlab.com/security-releases.xml', {
        timeout: 30000
      });

      const $ = cheerio.load(response.data, { xmlMode: true });
      const patches = [];
      const sevenDaysAgo = this.getSevenDaysAgo();

      $('entry').each((i, entry) => {
        const $entry = $(entry);
        const title = $entry.find('title').text().trim();
        const published = new Date($entry.find('published').text());
        const link = $entry.find('link').attr('href');
        const content = $entry.find('content').text();

        if (published >= sevenDaysAgo) {
          // Parse severity from content
          let severity = 'UNKNOWN';
          const contentLower = content.toLowerCase();
          if (contentLower.includes('critical')) severity = 'CRITICAL';
          else if (contentLower.includes('high')) severity = 'HIGH';
          else if (contentLower.includes('medium')) severity = 'MEDIUM';
          else if (contentLower.includes('low')) severity = 'LOW';

          // Extract CVEs if present
          const cveMatches = content.match(/CVE-\d{4}-\d+/g) || [];
          const description = cveMatches.length > 0
            ? `Security fixes for ${cveMatches.slice(0, 3).join(', ')}${cveMatches.length > 3 ? '...' : ''}`
            : 'Security patch release for GitLab CE/EE';

          patches.push({
            title,
            date: published.toISOString().split('T')[0],
            severity,
            vendor: 'gitlab',
            component: 'GitLab CE/EE',
            description: description.substring(0, 200),
            link
          });
        }
      });

      if (patches.length === 0) {
        this.log('No new patches found in the last 7 days');
      } else {
        this.log(`Found ${patches.length} security releases`);
      }

      return await this.updatePatchData(patches);
    } catch (error) {
      this.log(`Failed to fetch patches: ${error.message}`, 'ERROR');
      throw error;
    }
  }
}

// Execute if run directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const fetcher = new GitLabPatchFetcher();
  fetcher.fetchPatches().catch(console.error);
}

export default GitLabPatchFetcher;
