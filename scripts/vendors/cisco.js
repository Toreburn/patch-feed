import axios from 'axios';
import * as cheerio from 'cheerio';
import { fileURLToPath } from 'url';
import VendorPatchFetcher from '../vendor-fetch-template.js';

class CiscoPatchFetcher extends VendorPatchFetcher {
  constructor() {
    super('cisco');
  }

  async fetchPatches() {
    try {
      this.log('Starting Cisco patch fetch via PSIRT RSS');

      // Fetch from official Cisco Security Advisory RSS feed
      const response = await axios.get(
        'https://sec.cloudapps.cisco.com/security/center/psirtrss20/CiscoSecurityAdvisory.xml',
        { timeout: 30000 }
      );

      const $ = cheerio.load(response.data, { xmlMode: true });
      const patches = [];
      const sevenDaysAgo = this.getSevenDaysAgo();

      $('item').each((i, item) => {
        const $item = $(item);
        const title = $item.find('title').text().trim();
        const pubDateStr = $item.find('pubDate').text().trim();
        const description = $item.find('description').text().trim();
        const link = $item.find('guid').text().trim() || $item.find('link').text().trim();

        // Parse the date (format: "2026-01-21 16:00:00.0")
        const pubDate = new Date(pubDateStr.replace(' ', 'T').replace('.0', 'Z'));

        if (pubDate >= sevenDaysAgo) {
          // Extract severity from description
          let severity = 'UNKNOWN';
          const severityMatch = description.match(/Security Impact Rating:\s*(\w+)/i);
          if (severityMatch) {
            const sev = severityMatch[1].toLowerCase();
            if (sev === 'critical') severity = 'CRITICAL';
            else if (sev === 'high') severity = 'HIGH';
            else if (sev === 'medium') severity = 'MEDIUM';
            else if (sev === 'low') severity = 'LOW';
          }

          // Extract CVE from description
          const cveMatch = description.match(/CVE:\s*(CVE-[\d-]+)/);
          const cve = cveMatch ? cveMatch[1] : '';

          // Clean description (remove HTML tags)
          const cleanDesc = description
            .replace(/<[^>]*>/g, ' ')
            .replace(/&lt;[^&]*&gt;/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .substring(0, 200);

          patches.push({
            title,
            date: pubDate.toISOString().split('T')[0],
            severity,
            vendor: 'cisco',
            component: this.extractComponent(title),
            description: cleanDesc + (cleanDesc.length >= 200 ? '...' : ''),
            link,
            cve
          });
        }
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

  extractComponent(title) {
    const components = [
      'IOS XE', 'IOS', 'NX-OS', 'ASA', 'Firepower', 'WebEx',
      'Unified Communications', 'Identity Services', 'DNA Center',
      'SD-WAN', 'Meraki', 'Catalyst', 'Nexus', 'AnyConnect'
    ];

    const titleLower = title.toLowerCase();
    for (const component of components) {
      if (titleLower.includes(component.toLowerCase())) {
        return component;
      }
    }
    return 'Cisco Products';
  }
}

// Execute if run directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const fetcher = new CiscoPatchFetcher();
  fetcher.fetchPatches().catch(console.error);
}

export default CiscoPatchFetcher;
