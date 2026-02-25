import axios from 'axios';
import VendorPatchFetcher from '../vendor-fetch-template.js';
import { fileURLToPath } from 'url';

class SignalPatchFetcher extends VendorPatchFetcher {
  constructor() {
    super('signal');
  }

  async fetchPatches() {
    try {
      this.log('Starting Signal patch fetch via GitHub releases');
      const patches = [];
      const sevenDaysAgo = this.getSevenDaysAgo();

      // Signal publishes through GitHub releases for multiple apps
      const repos = [
        { repo: 'signalapp/Signal-Desktop', product: 'Signal Desktop' },
        { repo: 'signalapp/Signal-Android', product: 'Signal Android' },
        { repo: 'signalapp/Signal-iOS', product: 'Signal iOS' },
        { repo: 'signalapp/libsignal', product: 'libsignal' }
      ];

      for (const { repo, product } of repos) {
        try {
          // Fetch recent releases
          const releasesResponse = await axios.get(`https://api.github.com/repos/${repo}/releases`, {
            params: { per_page: 10 },
            headers: {
              'Accept': 'application/vnd.github+json',
              'User-Agent': 'PatchFeedBot/1.0'
            },
            timeout: 30000
          });

          for (const release of releasesResponse.data) {
            const pubDate = new Date(release.published_at);
            if (pubDate < sevenDaysAgo) continue;

            // Check if this is a security-related release
            const body = release.body || '';
            const name = release.name || release.tag_name || '';

            if (this.isSecurityRelated(name + ' ' + body)) {
              const cves = this.extractCVEs(body);

              patches.push({
                title: `${product} ${release.tag_name}${cves.length > 0 ? ': ' + cves.join(', ') : ''}`,
                date: pubDate.toISOString().split('T')[0],
                severity: this.extractSeverity(body),
                vendor: 'signal',
                component: product,
                description: this.cleanDescription(body),
                link: release.html_url,
                cves,
                platform: this.extractPlatforms(product)
              });
            }
          }

          // Also check security advisories for the repo
          try {
            const advisoriesResponse = await axios.get(`https://api.github.com/repos/${repo}/security-advisories`, {
              params: { state: 'published', per_page: 20 },
              headers: {
                'Accept': 'application/vnd.github+json',
                'User-Agent': 'PatchFeedBot/1.0'
              },
              timeout: 30000
            });

            for (const advisory of advisoriesResponse.data) {
              const pubDate = new Date(advisory.published_at);
              if (pubDate < sevenDaysAgo) continue;

              // Avoid duplicates based on CVE
              const cveId = advisory.cve_id;
              if (cveId && patches.some(p => p.cves?.includes(cveId))) continue;

              patches.push({
                title: advisory.summary || `${product} Security Advisory`,
                date: pubDate.toISOString().split('T')[0],
                severity: this.mapGitHubSeverity(advisory.severity),
                vendor: 'signal',
                component: product,
                description: (advisory.description || '').substring(0, 200),
                link: advisory.html_url,
                cves: cveId ? [cveId] : [],
                platform: this.extractPlatforms(product)
              });
            }
          } catch (advError) {
            // Security advisories might not be accessible - continue
          }
        } catch (repoError) {
          this.log(`Failed to fetch ${repo}: ${repoError.message}`, 'WARN');
        }
      }

      // Also check GitHub Advisory Database for Signal
      try {
        const ghAdvisories = await axios.get('https://api.github.com/advisories', {
          params: {
            per_page: 50,
            sort: 'published',
            direction: 'desc'
          },
          headers: {
            'Accept': 'application/vnd.github+json',
            'User-Agent': 'PatchFeedBot/1.0'
          },
          timeout: 30000
        });

        for (const advisory of ghAdvisories.data) {
          const pubDate = new Date(advisory.published_at);
          if (pubDate < sevenDaysAgo) continue;

          const summary = (advisory.summary || '').toLowerCase();
          const desc = (advisory.description || '').toLowerCase();

          if (!summary.includes('signal') && !desc.includes('signal')) continue;

          // Avoid duplicates
          const cveId = advisory.cve_id;
          if (cveId && patches.some(p => p.cves?.includes(cveId))) continue;

          patches.push({
            title: advisory.summary || 'Signal Security Advisory',
            date: pubDate.toISOString().split('T')[0],
            severity: this.mapGitHubSeverity(advisory.severity),
            vendor: 'signal',
            component: 'Signal',
            description: (advisory.description || '').substring(0, 200),
            link: advisory.html_url,
            cves: cveId ? [cveId] : [],
            platform: ['All Platforms']
          });
        }
      } catch (ghError) {
        this.log(`GitHub Advisory search failed: ${ghError.message}`, 'WARN');
      }

      if (patches.length === 0) {
        this.log('No new Signal security updates found in the last 7 days');
      } else {
        this.log(`Found ${patches.length} Signal security updates`);
      }

      return await this.updatePatchData(patches);
    } catch (error) {
      this.log(`Failed to fetch patches: ${error.message}`, 'ERROR');
      throw error;
    }
  }

  isSecurityRelated(text) {
    const keywords = [
      'security', 'vulnerability', 'cve', 'exploit',
      'fix', 'patch', 'bug', 'crash', 'memory',
      'buffer', 'overflow', 'injection', 'xss',
      'authentication', 'authorization', 'privilege',
      'encryption', 'cryptograph'
    ];
    const lower = text.toLowerCase();
    return keywords.some(kw => lower.includes(kw));
  }

  extractCVEs(text) {
    const matches = text.match(/CVE-\d{4}-\d+/gi) || [];
    return [...new Set(matches.map(m => m.toUpperCase()))];
  }

  extractSeverity(text) {
    const lower = text.toLowerCase();
    if (lower.includes('critical')) return 'CRITICAL';
    if (lower.includes('high') || lower.includes('important')) return 'HIGH';
    if (lower.includes('medium') || lower.includes('moderate')) return 'MEDIUM';
    if (lower.includes('low')) return 'LOW';
    return 'UNKNOWN';
  }

  extractPlatforms(product) {
    if (product.includes('Desktop')) return ['Desktop'];
    if (product.includes('Android')) return ['Android'];
    if (product.includes('iOS')) return ['iOS'];
    if (product.includes('libsignal')) return ['All Platforms'];
    return ['All Platforms'];
  }

  cleanDescription(text) {
    // Take first 200 chars, remove markdown, clean up
    return text
      .replace(/#+\s*/g, '')
      .replace(/\*+/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/\n+/g, ' ')
      .trim()
      .substring(0, 200);
  }

  mapGitHubSeverity(severity) {
    const map = {
      'critical': 'CRITICAL',
      'high': 'HIGH',
      'moderate': 'MEDIUM',
      'medium': 'MEDIUM',
      'low': 'LOW'
    };
    return map[(severity || '').toLowerCase()] || 'UNKNOWN';
  }
}

// Run the fetcher if this script is called directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const fetcher = new SignalPatchFetcher();
  fetcher.fetchPatches().catch(console.error);
}

export default SignalPatchFetcher;
