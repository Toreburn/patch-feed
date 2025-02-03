import VendorPatchFetcher from '../vendor-fetch-template.js';
import axios from 'axios';
import { fileURLToPath } from 'url';

class JetBrainsPatchFetcher extends VendorPatchFetcher {
  constructor() {
    super('jetbrains');
  }

  async fetchPatches() {
    try {
      // JetBrains Security Bulletins API
      const response = await axios.get('https://www.jetbrains.com/security/data/advisories.json');
      const advisories = response.data;
      
      const patches = [];
      const sevenDaysAgo = this.getSevenDaysAgo();

      for (const advisory of advisories) {
        const pubDate = new Date(advisory.published);
        
        // Only include patches from the last 7 days
        if (pubDate >= sevenDaysAgo) {
          patches.push({
            title: `${advisory.title} (${advisory.products.join(', ')})`,
            url: `https://www.jetbrains.com/security/advisory/${advisory.id}/`,
            date: pubDate.toISOString(),
            description: advisory.description,
            severity: this.mapSeverity(advisory.severity),
            vendor: 'jetbrains',
            cve: advisory.cve || [],
            affected_products: advisory.products
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
  const fetcher = new JetBrainsPatchFetcher();
  fetcher.fetchPatches().catch(console.error);
}

export default JetBrainsPatchFetcher;
