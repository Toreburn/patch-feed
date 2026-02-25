import VendorPatchFetcher from '../vendor-fetch-template.js';
import { fileURLToPath } from 'url';

class SafariPatchFetcher extends VendorPatchFetcher {
  constructor() {
    super('safari');
  }

  async fetchPatches() {
    try {
      this.log('Starting Safari patch fetch via SOFA feeds (Safari/WebKit filter)');

      const cutoff = this.getSevenDaysAgo();
      const patches = [];

      // Check both macOS and iOS feeds for Safari/WebKit updates
      const feeds = [
        'https://sofa.macadmins.io/v2/macos_data_feed.json',
        'https://sofa.macadmins.io/v2/ios_data_feed.json'
      ];

      for (const feedUrl of feeds) {
        try {
          const resp = await this.fetchWithRetry(feedUrl, {
            headers: { 'Accept': 'application/json' },
            timeout: 30000
          });

          const osVersions = resp.data?.OSVersions || [];
          for (const osVer of osVersions) {
            const releases = osVer?.SecurityReleases || [];
            for (const release of releases) {
              const releaseDate = new Date(release.ReleaseDate || release.UpdateDate || '');
              if (isNaN(releaseDate.getTime()) || releaseDate < cutoff) continue;

              const productName = release.ProductName || release.UpdateName || '';

              // Only include Safari or WebKit-related updates
              const lower = productName.toLowerCase();
              const isSafari = lower.includes('safari') || lower.includes('webkit');

              // Also check if the OS update includes Safari CVEs
              const cves = Array.isArray(release.CVEs || release.CVEsFixed) ?
                (release.CVEs || release.CVEsFixed) : [];
              const safariCves = cves.filter(c =>
                typeof c === 'string' && (c.toLowerCase().includes('webkit') || false)
              );

              if (!isSafari && safariCves.length === 0) continue;

              const cveCount = cves.length || (typeof release.CVEs === 'number' ? release.CVEs : 0);
              const securityInfo = release.SecurityInfo || '';

              patches.push({
                title: `Safari / WebKit Update: ${productName} ${release.ProductVersion || ''}`.trim(),
                date: releaseDate.toISOString().split('T')[0],
                severity: release.ActiveExploits === true ? 'CRITICAL' :
                          (cveCount > 10 ? 'HIGH' : (cveCount > 0 ? 'MEDIUM' : 'UNKNOWN')),
                vendor: 'safari',
                component: 'Safari Browser',
                description: `Safari/WebKit security update with ${cveCount} CVE${cveCount !== 1 ? 's' : ''} fixed.`,
                link: securityInfo || 'https://support.apple.com/en-us/100100',
                cve: cves[0] || ''
              });
            }
          }
        } catch (err) {
          this.log(`Feed ${feedUrl} failed: ${err.message}`, 'WARN');
        }
      }

      // Deduplicate
      const seen = new Set();
      const unique = patches.filter(p => {
        const key = `${p.title}|${p.date}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      this.log(`Found ${unique.length} Safari/WebKit security updates`);
      return await this.updatePatchData(unique);
    } catch (error) {
      this.log(`Failed to fetch patches: ${error.message}`, 'ERROR');
      throw error;
    }
  }
}

export default SafariPatchFetcher;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const fetcher = new SafariPatchFetcher();
  fetcher.fetchPatches().catch(console.error);
}
