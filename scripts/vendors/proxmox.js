import VendorPatchFetcher from '../vendor-fetch-template.js';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { fileURLToPath } from 'url';

class ProxmoxPatchFetcher extends VendorPatchFetcher {
  constructor() {
    super('proxmox');
  }

  async fetchPatches() {
    try {
      // Proxmox Security Advisories
      const response = await axios.get('https://www.proxmox.com/en/security/news');
      const $ = cheerio.load(response.data);
      
      const patches = [];
      const sevenDaysAgo = this.getSevenDaysAgo();

      // Parse the security advisories
      $('.blog-item').each((_, item) => {
        const $item = $(item);
        const title = $item.find('.title').text().trim();
        const dateStr = $item.find('.create').text().trim();
        const description = $item.find('.introtext').text().trim();
        const $link = $item.find('.title a');
        const url = $link.length ? new URL($link.attr('href'), 'https://www.proxmox.com').href : '';
        
        // Parse the date (format: DD Month YYYY)
        const pubDate = new Date(dateStr);
        
        // Only include patches from the last 7 days
        if (!isNaN(pubDate.getTime()) && pubDate >= sevenDaysAgo) {
          patches.push({
            title,
            url: url || 'https://www.proxmox.com/en/security/news',
            date: pubDate.toISOString(),
            description: this.cleanDescription(description),
            severity: this.extractSeverity(description),
            vendor: 'proxmox',
            affected_products: this.extractAffectedProducts(title + ' ' + description),
            cve: this.extractCVEs(title + ' ' + description),
            affected_versions: this.extractVersions(description)
          });
        }
      });

      // Also check Proxmox's bug tracker for security issues
      const bugTrackerResponse = await axios.get('https://bugzilla.proxmox.com/buglist.cgi', {
        params: {
          bug_status: ['NEW', 'ASSIGNED', 'REOPENED'],
          keywords: 'security',
          keywords_type: 'allwords',
          order: 'changeddate DESC',
          ctype: 'csv'
        }
      });

      const bugs = bugTrackerResponse.data.split('\n').slice(1); // Skip header row
      for (const bug of bugs) {
        const [id, status, summary, changed] = bug.split(',');
        const pubDate = new Date(changed);
        
        // Only include bugs from the last 7 days
        if (pubDate >= sevenDaysAgo) {
          patches.push({
            title: summary,
            url: `https://bugzilla.proxmox.com/show_bug.cgi?id=${id}`,
            date: pubDate.toISOString(),
            description: `Security issue reported in Proxmox bug tracker: ${summary}`,
            severity: 'Unknown', // Bug tracker doesn't consistently provide severity
            vendor: 'proxmox',
            affected_products: ['Proxmox'],
            bug_id: id,
            bug_status: status
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
    
    if (lower.includes('proxmox ve') || lower.includes('pve')) {
      products.add('Proxmox VE');
    }
    if (lower.includes('proxmox mail gateway') || lower.includes('pmg')) {
      products.add('Proxmox Mail Gateway');
    }
    if (lower.includes('proxmox backup server') || lower.includes('pbs')) {
      products.add('Proxmox Backup Server');
    }

    return products.size > 0 ? Array.from(products) : ['Proxmox'];
  }

  extractVersions(text) {
    const versions = new Set();
    
    // Look for version numbers in format x.y or x.y.z
    const versionMatches = text.match(/\d+\.\d+(?:\.\d+)?/g) || [];
    for (const version of versionMatches) {
      versions.add(version);
    }

    return Array.from(versions);
  }
}

// Run the fetcher if this script is called directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const fetcher = new ProxmoxPatchFetcher();
  fetcher.fetchPatches().catch(console.error);
}

export default ProxmoxPatchFetcher;
