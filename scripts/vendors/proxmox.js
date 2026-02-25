import axios from 'axios';
import * as cheerio from 'cheerio';
import { fileURLToPath } from 'url';
import VendorPatchFetcher from '../vendor-fetch-template.js';

class ProxmoxPatchFetcher extends VendorPatchFetcher {
  constructor() {
    super('proxmox');
  }

  async fetchPatches() {
    try {
      this.log('Starting Proxmox patch fetch via Security Advisories forum');

      // Fetch from Proxmox Security Advisories Forum
      const response = await axios.get('https://forum.proxmox.com/forums/security-advisories.26/', {
        timeout: 30000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; PatchFeedBot/1.0)'
        }
      });

      const $ = cheerio.load(response.data);
      const patches = [];
      const sevenDaysAgo = this.getSevenDaysAgo();

      // Parse forum threads for security advisories
      $('.structItem, .discussionListItem, article, .thread').each((_, item) => {
        const $item = $(item);

        const title = $item.find('.structItem-title a, .title a, h3 a').first().text().trim();
        const link = $item.find('.structItem-title a, .title a, h3 a').first().attr('href');
        const dateText = $item.find('.structItem-startDate, time, .DateTime').first().attr('datetime') ||
                        $item.find('.structItem-startDate, time, .DateTime').first().text().trim();

        if (!title || !title.match(/PSA-|security|CVE/i)) return;

        // Parse date
        let releaseDate = new Date(dateText);
        if (isNaN(releaseDate.getTime())) {
          // Try to extract date from title (e.g., PSA-2025-00013-1)
          const yearMatch = title.match(/PSA-(\d{4})/);
          if (yearMatch) {
            releaseDate = new Date();
          } else {
            return;
          }
        }

        if (releaseDate < sevenDaysAgo) return;

        // Extract advisory ID (e.g., PSA-2025-00013-1)
        const advisoryMatch = title.match(/PSA-\d{4}-\d+(?:-\d+)?/);
        const advisoryId = advisoryMatch ? advisoryMatch[0] : '';

        // Extract CVEs from title
        const cves = title.match(/CVE-\d{4}-\d+/g) || [];

        // Determine severity from title
        let severity = 'UNKNOWN';
        const titleLower = title.toLowerCase();
        if (titleLower.includes('critical')) severity = 'CRITICAL';
        else if (titleLower.includes('high') || titleLower.includes('important')) severity = 'HIGH';
        else if (titleLower.includes('medium') || titleLower.includes('moderate')) severity = 'MEDIUM';
        else if (titleLower.includes('low')) severity = 'LOW';

        patches.push({
          title: `Proxmox ${advisoryId}: ${title}`.substring(0, 150),
          date: releaseDate.toISOString().split('T')[0],
          severity,
          vendor: 'proxmox',
          component: this.determineComponent(title),
          description: `Proxmox security advisory${cves.length > 0 ? ': ' + cves.join(', ') : ''}`,
          link: link ? (link.startsWith('http') ? link : `https://forum.proxmox.com${link}`) : 'https://forum.proxmox.com/forums/security-advisories.26/',
          cves,
          advisoryId
        });
      });

      if (patches.length === 0) {
        this.log('No new patches found in the last 7 days');
      } else {
        this.log(`Found ${patches.length} security advisories`);
      }

      return await this.updatePatchData(patches);
    } catch (error) {
      this.log(`Failed to fetch patches: ${error.message}`, 'ERROR');
      throw error;
    }
  }

  determineComponent(text) {
    const lower = text.toLowerCase();
    if (lower.includes('pve') || lower.includes('virtual environment')) return 'Proxmox VE';
    if (lower.includes('pbs') || lower.includes('backup server')) return 'Proxmox Backup Server';
    if (lower.includes('pmg') || lower.includes('mail gateway')) return 'Proxmox Mail Gateway';
    return 'Proxmox Products';
  }
}

// Run the fetcher if this script is called directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const fetcher = new ProxmoxPatchFetcher();
  fetcher.fetchPatches().catch(console.error);
}

export default ProxmoxPatchFetcher;
