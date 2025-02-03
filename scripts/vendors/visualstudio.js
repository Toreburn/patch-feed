import VendorPatchFetcher from '../vendor-fetch-template.js';
import axios from 'axios';
import { fileURLToPath } from 'url';

class VisualStudioPatchFetcher extends VendorPatchFetcher {
  constructor() {
    super('visualstudio');
  }

  async fetchPatches() {
    try {
      // Microsoft Security Update Guide API for Visual Studio
      const response = await axios.get('https://api.msrc.microsoft.com/sug/v2.0/en-US/vulnerability/visualstudio', {
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
            vendor: 'visualstudio',
            cve: [vuln.cveNumber],
            affected_products: this.extractAffectedProducts(vuln),
            kb_articles: vuln.kbArticles?.map(kb => ({
              id: kb.articleNumber,
              url: kb.articleUrl
            })) || [],
            workarounds: vuln.workarounds || [],
            mitigations: vuln.mitigations || []
          });
        }
      }

      return this.updatePatchData(patches);
    } catch (error) {
      this.log(`Error fetching patches: ${error.message}`, 'ERROR');
      throw error;
    }
  }

  extractAffectedProducts(vuln) {
    const products = new Set();
    
    // Add main Visual Studio versions
    if (vuln.affectedProducts) {
      for (const product of vuln.affectedProducts) {
        if (product.name.toLowerCase().includes('visual studio')) {
          products.add(product.name);
        }
      }
    }

    // If no specific versions found, add generic product
    if (products.size === 0) {
      products.add('Visual Studio');
    }

    return Array.from(products);
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
  const fetcher = new VisualStudioPatchFetcher();
  fetcher.fetchPatches().catch(console.error);
}

export default VisualStudioPatchFetcher;
