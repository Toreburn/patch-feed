import VendorPatchFetcher from '../vendor-fetch-template.js';
import axios from 'axios';
import { fileURLToPath } from 'url';

class EdgePatchFetcher extends VendorPatchFetcher {
  constructor() {
    super('edge');
  }

  async fetchPatches() {
    try {
      // Microsoft Security Update Guide API for Edge
      const response = await axios.get('https://api.msrc.microsoft.com/sug/v2.0/en-US/vulnerability/edge', {
        headers: {
          'Accept': 'application/json'
        }
      });
      
      const patches = [];
      const sevenDaysAgo = this.getSevenDaysAgo();

      for (const vuln of response.data.value) {
        const pubDate = new Date(vuln.publishedDate);
        
        // Only include patches from the last 7 days
        if (pubDate >= sevenDaysAgo) {
          patches.push({
            title: `${vuln.title} (${vuln.cveNumber})`,
            url: `https://msrc.microsoft.com/update-guide/vulnerability/${vuln.cveNumber}`,
            date: pubDate.toISOString(),
            description: vuln.description,
            severity: this.mapSeverity(vuln.severity),
            vendor: 'edge',
            cve: [vuln.cveNumber],
            affected_products: ['Microsoft Edge'],
            affected_versions: vuln.affectedProducts?.map(p => p.version) || [],
            kb_articles: vuln.kbArticles?.map(kb => ({
              id: kb.articleNumber,
              url: kb.articleUrl
            })) || []
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
      'IMPORTANT': 'High',
      'MODERATE': 'Medium',
      'LOW': 'Low'
    };
    return severityMap[severity.toUpperCase()] || 'Unknown';
  }
}

// Run the fetcher if this script is called directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const fetcher = new EdgePatchFetcher();
  fetcher.fetchPatches().catch(console.error);
}

export default EdgePatchFetcher;
