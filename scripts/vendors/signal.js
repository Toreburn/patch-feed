import VendorPatchFetcher from '../vendor-fetch-template.js';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { fileURLToPath } from 'url';

class SignalPatchFetcher extends VendorPatchFetcher {
  constructor() {
    super('signal');
  }

  async fetchPatches() {
    try {
      // Signal Security Advisories from their blog
      const response = await axios.get('https://signal.org/blog/security/');
      const $ = cheerio.load(response.data);
      
      const patches = [];
      const sevenDaysAgo = this.getSevenDaysAgo();

      // Signal blog posts are in article elements
      $('article').each((_, article) => {
        const $article = $(article);
        const title = $article.find('h2').text().trim();
        const dateStr = $article.find('time').attr('datetime');
        const link = $article.find('h2 a').attr('href');
        const description = $article.find('.entry-content p').first().text().trim();
        
        if (dateStr) {
          const pubDate = new Date(dateStr);
          
          // Only include patches from the last 7 days
          if (pubDate >= sevenDaysAgo) {
            patches.push({
              title,
              url: link ? new URL(link, 'https://signal.org').href : 'https://signal.org/blog/security/',
              date: pubDate.toISOString(),
              description: this.cleanDescription(description),
              severity: this.extractSeverity(description),
              vendor: 'signal',
              affected_products: ['Signal'],
              cve: this.extractCVEs(description),
              platform: this.extractPlatforms(description)
            });
          }
        }
      });

      // Also check Signal's GitHub security advisories
      const githubResponse = await axios.get('https://api.github.com/repos/signalapp/Signal-Desktop/security-advisories', {
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
            vendor: 'signal',
            affected_products: ['Signal Desktop'],
            cve: advisory.cve_id ? [advisory.cve_id] : [],
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
  const fetcher = new SignalPatchFetcher();
  fetcher.fetchPatches().catch(console.error);
}

export default SignalPatchFetcher;
