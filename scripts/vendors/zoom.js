import VendorPatchFetcher from '../vendor-fetch-template.js';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { fileURLToPath } from 'url';

class ZoomPatchFetcher extends VendorPatchFetcher {
  constructor() {
    super('zoom');
  }

  async fetchPatches() {
    try {
      // Zoom Security Bulletins
      const response = await axios.get('https://explore.zoom.us/en/trust/security/security-bulletin/');
      const $ = cheerio.load(response.data);
      
      const patches = [];
      const sevenDaysAgo = this.getSevenDaysAgo();

      // Parse the security bulletins
      $('.security-bulletin').each((_, bulletin) => {
        const $bulletin = $(bulletin);
        const title = $bulletin.find('h3').text().trim();
        const dateStr = $bulletin.find('.date').text().trim();
        const description = $bulletin.find('.description').text().trim();
        const $link = $bulletin.find('a');
        const url = $link.length ? new URL($link.attr('href'), 'https://explore.zoom.us').href : '';
        
        // Parse the date (format varies but typically MM/DD/YYYY or Month DD, YYYY)
        const pubDate = new Date(dateStr);
        
        // Only include patches from the last 7 days
        if (!isNaN(pubDate.getTime()) && pubDate >= sevenDaysAgo) {
          patches.push({
            title,
            url: url || 'https://explore.zoom.us/en/trust/security/security-bulletin/',
            date: pubDate.toISOString(),
            description: this.cleanDescription(description),
            severity: this.extractSeverity(description),
            vendor: 'zoom',
            affected_products: this.extractAffectedProducts(description),
            cve: this.extractCVEs(description),
            platform: this.extractPlatforms(description),
            affected_versions: this.extractVersions(description)
          });
        }
      });

      // Also check Zoom's GitHub security advisories
      const githubResponse = await axios.get('https://api.github.com/repos/zoom/zoom-sdk-windows/security-advisories', {
        headers: {
          'Accept': 'application/vnd.github.v3+json'
        }
      });

      for (const advisory of githubResponse.data) {
        const pubDate = new Date(advisory.published_at);
        
        // Only include patches from the last 7 days
        if (pubDate >= sevenDaysAgo) {
          patches.push({
            title: advisory.summary,
            url: advisory.html_url,
            date: pubDate.toISOString(),
            description: advisory.description,
            severity: this.mapSeverity(advisory.severity),
            vendor: 'zoom',
            affected_products: ['Zoom SDK'],
            cve: advisory.cve_id ? [advisory.cve_id] : [],
            platform: ['Windows'],
            affected_versions: {
              fixed_in: advisory.patched_versions || [],
              vulnerable: advisory.vulnerable_versions || []
            }
          });
        }
      }

      return this.updatePatchData(patches);
    } catch (error) {
      this.log(`Error fetching patches: ${error.message}`, 'ERROR');
      throw error;
    }
  }

  cleanDescription(description) {
    return description
      .replace(/\s+/g, ' ')
      .trim();
  }

  extractSeverity(text) {
    const lower = text.toLowerCase();
    if (lower.includes('critical')) return 'Critical';
    if (lower.includes('high')) return 'High';
    if (lower.includes('medium')) return 'Medium';
    if (lower.includes('low')) return 'Low';
    return 'Unknown';
  }

  extractCVEs(text) {
    const cveMatches = text.match(/CVE-\d{4}-\d{4,7}/g) || [];
    return [...new Set(cveMatches)];
  }

  extractAffectedProducts(text) {
    const products = new Set();
    const lower = text.toLowerCase();
    
    if (lower.includes('client') || lower.includes('desktop')) {
      products.add('Zoom Client');
    }
    if (lower.includes('mobile')) {
      products.add('Zoom Mobile');
    }
    if (lower.includes('sdk')) {
      products.add('Zoom SDK');
    }
    if (lower.includes('meetings')) {
      products.add('Zoom Meetings');
    }
    if (lower.includes('phone')) {
      products.add('Zoom Phone');
    }
    if (lower.includes('rooms')) {
      products.add('Zoom Rooms');
    }

    return products.size > 0 ? Array.from(products) : ['Zoom'];
  }

  extractPlatforms(text) {
    const platforms = new Set();
    const lower = text.toLowerCase();
    
    if (lower.includes('windows')) {
      platforms.add('Windows');
    }
    if (lower.includes('macos') || lower.includes('mac os')) {
      platforms.add('macOS');
    }
    if (lower.includes('linux')) {
      platforms.add('Linux');
    }
    if (lower.includes('ios')) {
      platforms.add('iOS');
    }
    if (lower.includes('android')) {
      platforms.add('Android');
    }
    if (lower.includes('web') || lower.includes('browser')) {
      platforms.add('Web');
    }

    return platforms.size > 0 ? Array.from(platforms) : ['All Platforms'];
  }

  extractVersions(text) {
    const versions = new Set();
    
    // Look for version numbers in format x.y.z
    const versionMatches = text.match(/\d+\.\d+\.\d+/g) || [];
    for (const version of versionMatches) {
      versions.add(version);
    }

    return Array.from(versions);
  }

  mapSeverity(severity) {
    const severityMap = {
      'CRITICAL': 'Critical',
      'HIGH': 'High',
      'MODERATE': 'Medium',
      'LOW': 'Low'
    };
    return severityMap[severity?.toUpperCase()] || 'Unknown';
  }
}

// Run the fetcher if this script is called directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const fetcher = new ZoomPatchFetcher();
  fetcher.fetchPatches().catch(console.error);
}

export default ZoomPatchFetcher;
