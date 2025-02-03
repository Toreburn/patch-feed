import VendorPatchFetcher from '../vendor-fetch-template.js';
import axios from 'axios';
import { fileURLToPath } from 'url';

class GitLabPatchFetcher extends VendorPatchFetcher {
  constructor() {
    super('gitlab');
  }

  async fetchPatches() {
    try {
      // GitLab Security Advisories API
      const response = await axios.get('https://gitlab.com/api/v4/security/advisories', {
        params: {
          scope: 'all',
          state: 'published',
          per_page: 100
        }
      });
      
      const patches = [];
      const sevenDaysAgo = this.getSevenDaysAgo();

      for (const advisory of response.data) {
        const pubDate = new Date(advisory.published_at);
        
        // Only include patches from the last 7 days
        if (pubDate >= sevenDaysAgo) {
          patches.push({
            title: advisory.title,
            url: `https://gitlab.com/gitlab-org/security/advisories/-/advisory/${advisory.id}`,
            date: pubDate.toISOString(),
            description: advisory.description,
            severity: this.mapSeverity(advisory.severity),
            vendor: 'gitlab',
            cve: advisory.identifiers
              .filter(id => id.type === 'cve')
              .map(id => id.name),
            affected_products: ['GitLab'],
            affected_versions: {
              fixed_in: advisory.fixed_versions || [],
              affected: advisory.affected_versions || []
            },
            solution: advisory.solution,
            references: advisory.links?.map(link => link.url) || []
          });
        }
      }

      return this.updatePatchData(patches);
    } catch (error) {
      this.log(`Error fetching patches: ${error.message}`, 'ERROR');
      throw error;
    }
  }

  mapSeverity(severity) {
    const severityMap = {
      'CRITICAL': 'Critical',
      'HIGH': 'High',
      'MEDIUM': 'Medium',
      'LOW': 'Low'
    };
    return severityMap[severity.toUpperCase()] || 'Unknown';
  }
}

// Run the fetcher if this script is called directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const fetcher = new GitLabPatchFetcher();
  fetcher.fetchPatches().catch(console.error);
}

export default GitLabPatchFetcher;
