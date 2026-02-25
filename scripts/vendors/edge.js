import axios from 'axios';
import * as cheerio from 'cheerio';
import { fileURLToPath } from 'url';
import VendorPatchFetcher from '../vendor-fetch-template.js';

class EdgePatchFetcher extends VendorPatchFetcher {
  constructor() {
    super('edge');
  }

  async fetchPatches() {
    try {
      this.log('Starting Microsoft Edge patch fetch via Release Notes');

      // Microsoft Edge Release Notes page
      const response = await axios.get(
        'https://learn.microsoft.com/en-us/deployedge/microsoft-edge-relnotes-security',
        {
          timeout: 30000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; PatchFeedBot/1.0)'
          }
        }
      );

      const $ = cheerio.load(response.data);
      const patches = [];
      const sevenDaysAgo = this.getSevenDaysAgo();

      // Parse security release notes - look for version headers and CVE lists
      $('h2, h3').each((_, heading) => {
        const $heading = $(heading);
        const text = $heading.text().trim();

        // Match version patterns like "January 23, 2026" or "Version 131.0.2903.112"
        const dateMatch = text.match(/(\w+ \d{1,2}, \d{4})/);
        if (dateMatch) {
          const releaseDate = new Date(dateMatch[1]);

          if (releaseDate >= sevenDaysAgo) {
            // Get the content following this heading
            let content = '';
            let next = $heading.next();
            while (next.length && !next.is('h2, h3')) {
              content += next.text() + ' ';
              next = next.next();
            }

            // Extract CVEs
            const cves = content.match(/CVE-\d{4}-\d+/g) || [];

            if (cves.length > 0 || content.toLowerCase().includes('security')) {
              patches.push({
                title: `Microsoft Edge Security Update - ${text}`,
                link: 'https://learn.microsoft.com/en-us/deployedge/microsoft-edge-relnotes-security',
                date: releaseDate.toISOString().split('T')[0],
                description: `Security fixes for ${cves.length} vulnerabilities: ${cves.slice(0, 3).join(', ')}${cves.length > 3 ? '...' : ''}`,
                severity: this.determineSeverity(content),
                vendor: 'edge',
                component: 'Microsoft Edge',
                cves: cves
              });
            }
          }
        }
      });

      if (patches.length === 0) {
        this.log('No new patches found in the last 7 days');
      } else {
        this.log(`Found ${patches.length} security updates`);
      }

      return await this.updatePatchData(patches);
    } catch (error) {
      this.log(`Failed to fetch patches: ${error.message}`, 'ERROR');
      throw error;
    }
  }

  determineSeverity(content) {
    const lower = content.toLowerCase();
    if (lower.includes('critical') || lower.includes('remote code execution')) return 'CRITICAL';
    if (lower.includes('high') || lower.includes('privilege escalation')) return 'HIGH';
    if (lower.includes('medium') || lower.includes('moderate')) return 'MEDIUM';
    if (lower.includes('low')) return 'LOW';
    return 'HIGH'; // Default to HIGH for browser security updates
  }
}

// Run the fetcher if this script is called directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const fetcher = new EdgePatchFetcher();
  fetcher.fetchPatches().catch(console.error);
}

export default EdgePatchFetcher;
