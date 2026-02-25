import VendorPatchFetcher from '../vendor-fetch-template.js';
import { fileURLToPath } from 'url';

class GithubPatchFetcher extends VendorPatchFetcher {
  constructor() {
    super('github');
  }

  async fetchPatches() {
    try {
      this.log('Starting GitHub patch fetch via Advisory Database API');

      const cutoff = this.getSevenDaysAgo();
      const since = cutoff.toISOString();

      // GitHub public advisory database API (no auth required for public advisories)
      const response = await this.fetchWithRetry(
        `https://api.github.com/advisories?per_page=50&sort=published&direction=desc&type=reviewed`,
        {
          headers: {
            'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            'User-Agent': 'PatchFeed/1.0'
          }
        }
      );

      const advisories = response.data || [];
      const patches = [];

      this.log(`GitHub API returned ${advisories.length} advisories`);

      for (const adv of advisories) {
        const pubDate = new Date(adv.published_at || adv.updated_at || '');
        if (isNaN(pubDate.getTime()) || pubDate < cutoff) continue;

        const severity = (adv.severity || 'unknown').toUpperCase();
        const cveId = adv.cve_id || '';
        const description = (adv.summary || adv.description || '').substring(0, 200);

        // Extract affected package names
        const components = (adv.vulnerabilities || [])
          .map(v => v.package?.name)
          .filter(Boolean);
        const component = components.length > 0
          ? components.slice(0, 3).join(', ')
          : 'GitHub Advisory';

        patches.push({
          title: adv.summary || cveId || 'GitHub Security Advisory',
          date: pubDate.toISOString().split('T')[0],
          severity: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].includes(severity) ? severity : 'UNKNOWN',
          vendor: 'github',
          component,
          description: description + (description.length >= 200 ? '...' : ''),
          link: adv.html_url || `https://github.com/advisories/${adv.ghsa_id || ''}`,
          cve: cveId,
          cvss: adv.cvss?.score || null
        });
      }

      this.log(`Found ${patches.length} GitHub advisories in lookback window`);
      return await this.updatePatchData(patches);
    } catch (error) {
      this.log(`Failed to fetch patches: ${error.message}`, 'ERROR');
      throw error;
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const fetcher = new GithubPatchFetcher();
  fetcher.fetchPatches().catch(console.error);
}

export default GithubPatchFetcher;
