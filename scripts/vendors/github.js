import VendorPatchFetcher from '../vendor-fetch-template.js';
import axios from 'axios';
import { fileURLToPath } from 'url';

class GitHubPatchFetcher extends VendorPatchFetcher {
  constructor() {
    super('github');
  }

  async fetchPatches() {
    try {
      // GitHub Security Advisories API
      const response = await axios.get('https://api.github.com/enterprises/advisories', {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'X-GitHub-Api-Version': '2022-11-28'
        }
      });
      
      const patches = [];
      const sevenDaysAgo = this.getSevenDaysAgo();

      for (const advisory of response.data) {
        const pubDate = new Date(advisory.published_at);
        
        // Only include patches from the last 7 days
        if (pubDate >= sevenDaysAgo) {
          patches.push({
            title: advisory.summary,
            url: advisory.html_url,
            date: pubDate.toISOString(),
            description: advisory.description,
            severity: this.mapSeverity(advisory.severity),
            vendor: 'github',
            cve: advisory.cve_id ? [advisory.cve_id] : [],
            affected_products: ['GitHub Enterprise'],
            references: advisory.references || [],
            cwes: advisory.cwes?.map(cwe => cwe.cwe_id) || []
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
      'MODERATE': 'Medium',
      'LOW': 'Low'
    };
    return severityMap[severity.toUpperCase()] || 'Unknown';
  }
}

// Run the fetcher if this script is called directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const fetcher = new GitHubPatchFetcher();
  fetcher.fetchPatches().catch(console.error);
}

export default GitHubPatchFetcher;
