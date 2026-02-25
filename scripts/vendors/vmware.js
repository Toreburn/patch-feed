import axios from 'axios';
import VendorPatchFetcher from '../vendor-fetch-template.js';
import { fileURLToPath } from 'url';

class VMwarePatchFetcher extends VendorPatchFetcher {
  constructor() {
    super('vmware');
  }

  async fetchPatches() {
    try {
      this.log('Starting VMware patch fetch via Broadcom Security Advisory API');

      const cutoff = this.getSevenDaysAgo();
      const patches = [];

      try {
        const response = await axios.post(
          'https://support.broadcom.com/web/ecx/security-advisory/-/security-advisory/getSecurityAdvisoryList',
          { segment: 'VC', offset: 0, limit: 50 },
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

          const title = adv.advisoryTitle || adv.title || adv.id || 'VMware Advisory';
          const desc = adv.synopsis || adv.description || adv.summary || '';
          const cves = this.extractCVEs(title + ' ' + desc + ' ' + (adv.cveIds || []).join(' '));

          patches.push({
            title,
            date: pubDate.toISOString().split('T')[0],
            severity: this.getSeverityFromText(adv.severity || adv.impact || desc),
            vendor: 'vmware',
            component: this.extractComponent(title + ' ' + desc),
            description: desc.substring(0, 200) + (desc.length > 200 ? '...' : ''),
            link: adv.url || adv.link || `https://support.broadcom.com/web/ecx/security-advisory`,
            cve: cves[0] || ''
          });
        }
      } catch (err) {
        this.log(`Broadcom API failed: ${err.message}`, 'WARN');
      }

      this.log(`Found ${patches.length} VMware security advisories`);
      return await this.updatePatchData(patches);
    } catch (error) {
      this.log(`Failed to fetch patches: ${error.message}`, 'ERROR');
      throw error;
    }
  }

  extractComponent(text) {
    const products = [
      'ESXi', 'vCenter Server', 'vCenter',
      'vSphere', 'NSX', 'Horizon',
      'Workstation', 'Fusion',
      'Aria Operations', 'Aria Automation', 'Aria',
      'Cloud Foundation', 'HCX', 'Tanzu',
      'Carbon Black', 'SD-WAN', 'Tools',
      'Spring Framework', 'Spring'
    ];
    const lower = text.toLowerCase();
    for (const product of products) {
      if (lower.includes(product.toLowerCase())) return product;
    }
    return 'VMware Products';
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const fetcher = new VMwarePatchFetcher();
  fetcher.fetchPatches().catch(console.error);
}

export default VMwarePatchFetcher;
