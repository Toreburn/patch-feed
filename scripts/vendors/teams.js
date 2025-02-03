import VendorPatchFetcher from '../vendor-fetch-template.js';
import axios from 'axios';
import { fileURLToPath } from 'url';

class TeamsPatchFetcher extends VendorPatchFetcher {
  constructor() {
    super('teams');
  }

  async fetchPatches() {
    try {
      // Microsoft Security Update Guide API for Teams
      const response = await axios.get('https://api.msrc.microsoft.com/sug/v2.0/en-US/vulnerability/teams', {
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
            vendor: 'teams',
            cve: [vuln.cveNumber],
            affected_products: this.extractAffectedProducts(vuln),
            kb_articles: vuln.kbArticles?.map(kb => ({
              id: kb.articleNumber,
              url: kb.articleUrl
            })) || [],
            platform: this.extractPlatforms(vuln),
            workarounds: vuln.workarounds || [],
            mitigations: vuln.mitigations || []
          });
        }
      }

      // Also check Microsoft 365 Apps security updates that might affect Teams
      const m365Response = await axios.get('https://api.msrc.microsoft.com/sug/v2.0/en-US/vulnerability/microsoft365apps', {
        headers: {
          'Accept': 'application/json'
        }
      });

      for (const vuln of m365Response.data.value) {
        const pubDate = new Date(vuln.publishedDate);
        
        // Only include Teams-related patches from the last 7 days
        if (pubDate >= sevenDaysAgo && 
            (vuln.title.toLowerCase().includes('teams') || 
             vuln.description.toLowerCase().includes('teams'))) {
          patches.push({
            title: `${vuln.title} (${vuln.cveNumber})`,
            url: `https://msrc.microsoft.com/update-guide/vulnerability/${vuln.cveNumber}`,
            date: pubDate.toISOString(),
            description: vuln.description,
            severity: this.mapSeverity(vuln.severity),
            vendor: 'teams',
            cve: [vuln.cveNumber],
            affected_products: ['Microsoft Teams'],
            kb_articles: vuln.kbArticles?.map(kb => ({
              id: kb.articleNumber,
              url: kb.articleUrl
            })) || [],
            platform: this.extractPlatforms(vuln),
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
    
    // Add Teams-specific products
    if (vuln.affectedProducts) {
      for (const product of vuln.affectedProducts) {
        if (product.name.toLowerCase().includes('teams')) {
          products.add(product.name);
        }
      }
    }

    // If no specific versions found, add generic product
    if (products.size === 0) {
      products.add('Microsoft Teams');
    }

    return Array.from(products);
  }

  extractPlatforms(vuln) {
    const platforms = new Set();
    const text = `${vuln.title} ${vuln.description}`.toLowerCase();

    if (text.includes('desktop') || text.includes('windows') || text.includes('macos') || text.includes('linux')) {
      platforms.add('Desktop');
    }
    if (text.includes('mobile') || text.includes('ios') || text.includes('android')) {
      platforms.add('Mobile');
    }
    if (text.includes('web') || text.includes('browser')) {
      platforms.add('Web');
    }

    return platforms.size > 0 ? Array.from(platforms) : ['All Platforms'];
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
  const fetcher = new TeamsPatchFetcher();
  fetcher.fetchPatches().catch(console.error);
}

export default TeamsPatchFetcher;
