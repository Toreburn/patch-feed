import axios from 'axios';
import VendorPatchFetcher from '../vendor-fetch-template.js';
import { fileURLToPath } from 'url';

class VisualStudioPatchFetcher extends VendorPatchFetcher {
  constructor() {
    super('visualstudio');
  }

  async fetchPatches() {
    try {
      this.log('Starting Visual Studio patch fetch via MSRC CVRF API');
      const patches = [];
      const sevenDaysAgo = this.getSevenDaysAgo();

      // Get current month CVRF document
      const now = new Date();
      const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastMonthStr = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}`;

      // Try current month and last month
      for (const month of [currentMonth, lastMonthStr]) {
        try {
          const response = await axios.get(`https://api.msrc.microsoft.com/cvrf/v3.0/cvrf/${month}`, {
            headers: {
              'Accept': 'application/json',
              'User-Agent': 'PatchFeedBot/1.0'
            },
            timeout: 30000
          });

          const cvrf = response.data;

          // Process each vulnerability
          if (cvrf.Vulnerability) {
            for (const vuln of cvrf.Vulnerability) {
              // Check if this is Visual Studio-related
              const isVSRelated = this.isVisualStudioRelated(vuln);
              if (!isVSRelated) continue;

              // Get revision date
              const revisionDate = vuln.RevisionHistory?.[0]?.Date;
              if (!revisionDate) continue;

              const pubDate = new Date(revisionDate);
              if (pubDate < sevenDaysAgo) continue;

              // Get CVE ID
              const cveId = vuln.CVE;

              // Avoid duplicates
              if (patches.some(p => p.cves?.includes(cveId))) continue;

              // Get title
              const title = vuln.Title?.Value || cveId;

              // Get severity from CVSS
              const cvssV3 = vuln.CVSSScoreSets?.find(s => s.BaseScore);
              let severity = 'UNKNOWN';
              if (cvssV3?.BaseScore >= 9.0) severity = 'CRITICAL';
              else if (cvssV3?.BaseScore >= 7.0) severity = 'HIGH';
              else if (cvssV3?.BaseScore >= 4.0) severity = 'MEDIUM';
              else if (cvssV3?.BaseScore > 0) severity = 'LOW';

              // Get description
              const description = vuln.Notes?.find(n => n.Type === 1)?.Value || '';

              patches.push({
                title: `Visual Studio: ${title} (${cveId})`,
                date: pubDate.toISOString().split('T')[0],
                severity,
                vendor: 'visualstudio',
                component: this.determineComponent(vuln),
                description: this.cleanDescription(description),
                link: `https://msrc.microsoft.com/update-guide/vulnerability/${cveId}`,
                cves: [cveId],
                cvssScore: cvssV3?.BaseScore
              });
            }
          }
        } catch (monthError) {
          this.log(`Failed to fetch CVRF for ${month}: ${monthError.message}`, 'WARN');
        }
      }

      // Also check VS Code via GitHub
      try {
        const releases = await axios.get('https://api.github.com/repos/microsoft/vscode/releases', {
          params: { per_page: 10 },
          headers: {
            'Accept': 'application/vnd.github+json',
            'User-Agent': 'PatchFeedBot/1.0'
          },
          timeout: 30000
        });

        for (const release of releases.data) {
          const pubDate = new Date(release.published_at);
          if (pubDate < sevenDaysAgo) continue;

          const body = release.body || '';
          if (this.isSecurityRelated(release.name + ' ' + body)) {
            const cves = this.extractCVEs(body);

            patches.push({
              title: `VS Code ${release.tag_name}${cves.length > 0 ? ': ' + cves.join(', ') : ''}`,
              date: pubDate.toISOString().split('T')[0],
              severity: this.extractSeverity(body),
              vendor: 'visualstudio',
              component: 'Visual Studio Code',
              description: this.cleanDescription(body),
              link: release.html_url,
              cves
            });
          }
        }
      } catch (ghError) {
        this.log(`VS Code GitHub check failed: ${ghError.message}`, 'WARN');
      }

      if (patches.length === 0) {
        this.log('No new Visual Studio patches found in the last 7 days');
      } else {
        this.log(`Found ${patches.length} Visual Studio security updates`);
      }

      return await this.updatePatchData(patches);
    } catch (error) {
      this.log(`Failed to fetch patches: ${error.message}`, 'ERROR');
      throw error;
    }
  }

  isVisualStudioRelated(vuln) {
    const productIds = vuln.ProductStatuses?.[0]?.ProductID || [];
    const notes = JSON.stringify(vuln.Notes || []).toLowerCase();
    const title = (vuln.Title?.Value || '').toLowerCase();

    // Check if Visual Studio is mentioned
    if (title.includes('visual studio') || notes.includes('visual studio')) {
      return true;
    }

    // Check affected products
    for (const productId of productIds) {
      if (productId.toLowerCase().includes('visual studio')) {
        return true;
      }
    }

    return false;
  }

  determineComponent(vuln) {
    const notes = JSON.stringify(vuln.Notes || []).toLowerCase();
    const productIds = (vuln.ProductStatuses?.[0]?.ProductID || []).join(' ').toLowerCase();

    if (notes.includes('code') || productIds.includes('code')) return 'Visual Studio Code';
    if (notes.includes('2022') || productIds.includes('2022')) return 'Visual Studio 2022';
    if (notes.includes('2019') || productIds.includes('2019')) return 'Visual Studio 2019';
    if (notes.includes('2017') || productIds.includes('2017')) return 'Visual Studio 2017';

    return 'Visual Studio';
  }

  isSecurityRelated(text) {
    const keywords = [
      'security', 'vulnerability', 'cve', 'exploit',
      'fix', 'patch', 'bug', 'memory', 'buffer',
      'injection', 'xss', 'authentication'
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

  cleanDescription(html) {
    return html
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/#+\s*/g, '')
      .replace(/\*+/g, '')
      .replace(/\n+/g, ' ')
      .trim()
      .substring(0, 200);
  }
}

// Run the fetcher if this script is called directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const fetcher = new VisualStudioPatchFetcher();
  fetcher.fetchPatches().catch(console.error);
}

export default VisualStudioPatchFetcher;
