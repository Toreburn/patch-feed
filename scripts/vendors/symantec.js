import axios from 'axios';
import VendorPatchFetcher from '../vendor-fetch-template.js';
import { fileURLToPath } from 'url';

class SymantecPatchFetcher extends VendorPatchFetcher {
  constructor() {
    super('symantec');
  }

  async fetchPatches() {
    try {
      this.log('Starting Symantec patch fetch via Broadcom Security Advisory API');

      const cutoff = this.getSevenDaysAgo();
      const patches = [];

      try {
        const response = await axios.post(
          'https://support.broadcom.com/web/ecx/security-advisory/-/security-advisory/getSecurityAdvisoryList',
          { segment: 'SE', offset: 0, limit: 50 },
          {
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json',
              'User-Agent': 'PatchFeedBot/1.0'
            },
            timeout: 30000
          }
        );

        const advisories = response.data?.advisoryList || response.data?.data || response.data || [];
        const items = Array.isArray(advisories) ? advisories : [];

        for (const adv of items) {
          const pubDate = new Date(adv.publishedDate || adv.releaseDate || adv.date || '');
          if (isNaN(pubDate.getTime()) || pubDate < cutoff) continue;

          const title = adv.advisoryTitle || adv.title || adv.id || 'Symantec Advisory';
          const desc = adv.synopsis || adv.description || adv.summary || '';
          const cves = this.extractCVEs(title + ' ' + desc + ' ' + (adv.cveIds || []).join(' '));

          patches.push({
            title,
            date: pubDate.toISOString().split('T')[0],
            severity: this.getSeverityFromText(adv.severity || adv.impact || desc),
            vendor: 'symantec',
            component: this.extractComponent(title + ' ' + desc),
            description: desc.substring(0, 200) + (desc.length > 200 ? '...' : ''),
            link: adv.url || adv.link || `https://support.broadcom.com/web/ecx/security-advisory`,
            cve: cves[0] || ''
          });
        }
      } catch (err) {
        this.log(`Broadcom API failed: ${err.message}`, 'WARN');
      }

      this.log(`Found ${patches.length} Symantec security advisories`);
      return await this.updatePatchData(patches);
    } catch (error) {
      this.log(`Failed to fetch patches: ${error.message}`, 'ERROR');
      throw error;
    }
  }

  extractComponent(text) {
    const lower = text.toLowerCase();
    if (lower.includes('endpoint protection') || lower.includes('sep')) return 'Endpoint Protection';
    if (lower.includes('norton')) return 'Norton';
    if (lower.includes('dlp') || lower.includes('data loss')) return 'Data Loss Prevention';
    if (lower.includes('email')) return 'Email Security';
    if (lower.includes('web gateway') || lower.includes('proxy')) return 'Web Gateway';
    if (lower.includes('messaging')) return 'Messaging Gateway';
    if (lower.includes('vip') || lower.includes('authentication')) return 'VIP Authentication';
    return 'Symantec Products';
  }
}

export default SymantecPatchFetcher;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const fetcher = new SymantecPatchFetcher();
  fetcher.fetchPatches().catch(console.error);
}
