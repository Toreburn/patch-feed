import VendorPatchFetcher from '../vendor-fetch-template.js';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { fileURLToPath } from 'url';

class SlackPatchFetcher extends VendorPatchFetcher {
  constructor() {
    super('slack');
  }

  async fetchPatches() {
    try {
      // Slack Security Updates Page
      const response = await axios.get('https://slack.com/security-updates');
      const $ = cheerio.load(response.data);
      
      const patches = [];
      const sevenDaysAgo = this.getSevenDaysAgo();

      // Slack lists their security updates in a structured format
      $('.security-update').each((_, update) => {
        const $update = $(update);
        const title = $update.find('h3').text().trim();
        const dateStr = $update.find('.date').text().trim();
        const description = $update.find('.description').text().trim();
        
        // Parse the date (format varies but typically MM/DD/YYYY or Month DD, YYYY)
        const pubDate = new Date(dateStr);
        
        // Only include patches from the last 7 days
        if (!isNaN(pubDate.getTime()) && pubDate >= sevenDaysAgo) {
          patches.push({
            title,
            url: 'https://slack.com/security-updates',
            date: pubDate.toISOString(),
            description: this.cleanDescription(description),
            severity: this.extractSeverity(description),
            vendor: 'slack',
            affected_products: ['Slack'],
            cve: this.extractCVEs(description),
            platform: this.extractPlatforms(description),
            affected_versions: this.extractVersions(description)
          });
        }
      });

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
}

// Run the fetcher if this script is called directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const fetcher = new SlackPatchFetcher();
  fetcher.fetchPatches().catch(console.error);
}

export default SlackPatchFetcher;
