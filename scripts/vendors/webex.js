import VendorPatchFetcher from '../vendor-fetch-template.js';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { fileURLToPath } from 'url';

class WebexPatchFetcher extends VendorPatchFetcher {
  constructor() {
    super('webex');
  }

  async fetchPatches() {
    try {
      // Cisco Security Advisories for Webex
      const response = await axios.get('https://tools.cisco.com/security/center/publicationListing.x', {
        params: {
          product: 'Webex',
          limit: 100
        }
      });
      const $ = cheerio.load(response.data);
      
      const patches = [];
      const sevenDaysAgo = this.getSevenDaysAgo();

      // Parse the security advisories table
      $('.table-striped tr').each((_, row) => {
        const $row = $(row);
        const cells = $row.find('td');
        
        if (cells.length >= 4) {
          const dateStr = $(cells[0]).text().trim();
          const title = $(cells[1]).text().trim();
          const severity = $(cells[2]).text().trim();
          const $link = $(cells[1]).find('a');
          const url = $link.length ? new URL($link.attr('href'), 'https://tools.cisco.com').href : '';
          
          // Parse the date (format: YYYY-MM-DD)
          const pubDate = new Date(dateStr);
          
          // Only include patches from the last 7 days
          if (!isNaN(pubDate.getTime()) && pubDate >= sevenDaysAgo) {
            patches.push({
              title,
              url: url || 'https://tools.cisco.com/security/center/publicationListing.x',
              date: pubDate.toISOString(),
              description: this.extractDescription($, url),
              severity: this.mapSeverity(severity),
              vendor: 'webex',
              affected_products: ['Cisco Webex'],
              cve: this.extractCVEs(title),
              platform: this.extractPlatforms(title),
              advisory_id: this.extractAdvisoryId(title)
            });
          }
        }
      });

      return this.updatePatchData(patches);
    } catch (error) {
      this.log(`Error fetching patches: ${error.message}`, 'ERROR');
      throw error;
    }
  }

  async extractDescription($, url) {
    if (!url) return 'See advisory page for details.';

    try {
      const response = await axios.get(url);
      const $detail = cheerio.load(response.data);
      const description = $detail('#advisory-content').text().trim();
      return description || 'See advisory page for details.';
    } catch (error) {
      this.log(`Error fetching advisory details: ${error.message}`, 'WARN');
      return 'See advisory page for details.';
    }
  }

  extractCVEs(text) {
    const cveMatches = text.match(/CVE-\d{4}-\d{4,7}/g) || [];
    return [...new Set(cveMatches)];
  }

  extractAdvisoryId(text) {
    const match = text.match(/cisco-sa-\d{8}-[a-z0-9-]+/i);
    return match ? match[0] : null;
  }

  extractPlatforms(text) {
    const platforms = new Set();
    const lower = text.toLowerCase();
    
    if (lower.includes('desktop') || lower.includes('windows') || lower.includes('macos') || lower.includes('linux')) {
      platforms.add('Desktop');
    }
    if (lower.includes('mobile') || lower.includes('ios') || lower.includes('android')) {
      platforms.add('Mobile');
    }
    if (lower.includes('web') || lower.includes('browser')) {
      platforms.add('Web');
    }
    if (lower.includes('meetings') || lower.includes('conferencing')) {
      platforms.add('Meetings');
    }
    if (lower.includes('teams') || lower.includes('messaging')) {
      platforms.add('Teams');
    }

    return platforms.size > 0 ? Array.from(platforms) : ['All Platforms'];
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
  const fetcher = new WebexPatchFetcher();
  fetcher.fetchPatches().catch(console.error);
}

export default WebexPatchFetcher;
