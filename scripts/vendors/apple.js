import VendorPatchFetcher from '../vendor-fetch-template.js';
import { fileURLToPath } from 'url';

class ApplePatchFetcher extends VendorPatchFetcher {
  constructor() {
    super('apple');
  }

  async fetchPatches() {
    try {
      this.log('Starting Apple patch fetch via SOFA macOS + iOS feeds');

      const cutoff = this.getSevenDaysAgo();
      const patches = [];

      // Fetch macOS data from SOFA
      try {
        const macResp = await this.fetchWithRetry(
          'https://sofa.macadmins.io/v2/macos_data_feed.json',
          { headers: { 'Accept': 'application/json' }, timeout: 30000 }
        );
        this.parseSofaFeed(macResp.data, cutoff, patches);
      } catch (err) {
        this.log(`macOS SOFA feed failed: ${err.message}`, 'WARN');
      }

      // Fetch iOS data from SOFA
      try {
        const iosResp = await this.fetchWithRetry(
          'https://sofa.macadmins.io/v2/ios_data_feed.json',
          { headers: { 'Accept': 'application/json' }, timeout: 30000 }
        );
        this.parseSofaFeed(iosResp.data, cutoff, patches);
      } catch (err) {
        this.log(`iOS SOFA feed failed: ${err.message}`, 'WARN');
      }

      // Deduplicate by title+date
      const seen = new Set();
      const unique = patches.filter(p => {
        const key = `${p.title}|${p.date}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      this.log(`Found ${unique.length} Apple security updates from SOFA feeds`);
      return await this.updatePatchData(unique);
    } catch (error) {
      this.log(`Failed to fetch patches: ${error.message}`, 'ERROR');
      throw error;
    }
  }

  parseSofaFeed(data, cutoff, patches) {
    // SOFA feeds have an OSVersions array, each with SecurityReleases
    const osVersions = data?.OSVersions || [];
    for (const osVer of osVersions) {
      const releases = osVer?.SecurityReleases || [];
      for (const release of releases) {
        const releaseDate = new Date(release.ReleaseDate || release.UpdateDate || '');
        if (isNaN(releaseDate.getTime()) || releaseDate < cutoff) continue;

        const productName = release.ProductName || release.UpdateName || osVer.OSVersion || 'Apple OS';
        const cves = release.CVEs || release.CVEsFixed || [];
        const cveCount = typeof cves === 'number' ? cves : (Array.isArray(cves) ? cves.length : 0);
        const cveList = Array.isArray(cves) ? cves : [];
        const securityInfo = release.SecurityInfo || '';

        patches.push({
          title: `${productName} ${release.ProductVersion || release.UpdateVersion || ''}`.trim(),
          date: releaseDate.toISOString().split('T')[0],
          severity: release.ActiveExploits === true ? 'CRITICAL' :
                    (cveCount > 20 ? 'HIGH' : (cveCount > 0 ? 'MEDIUM' : 'UNKNOWN')),
          vendor: 'apple',
          component: this.extractComponent(productName),
          description: `Security update with ${cveCount} CVE${cveCount !== 1 ? 's' : ''} fixed.${release.ActiveExploits ? ' Includes actively exploited vulnerabilities.' : ''}`,
          link: securityInfo || 'https://support.apple.com/en-us/100100',
          cve: cveList[0] || ''
        });
      }
    }
  }

  extractComponent(productName) {
    const lower = (productName || '').toLowerCase();
    if (lower.includes('macos')) return 'macOS';
    if (lower.includes('ios') || lower.includes('ipad')) return 'iOS / iPadOS';
    if (lower.includes('watchos')) return 'watchOS';
    if (lower.includes('tvos')) return 'tvOS';
    if (lower.includes('visionos')) return 'visionOS';
    if (lower.includes('safari')) return 'Safari';
    if (lower.includes('xcode')) return 'Xcode';
    return 'Apple Products';
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const fetcher = new ApplePatchFetcher();
  fetcher.fetchPatches().catch(console.error);
}

export default ApplePatchFetcher;
