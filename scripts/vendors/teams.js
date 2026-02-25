import * as cheerio from 'cheerio';
import VendorPatchFetcher from '../vendor-fetch-template.js';
import { fileURLToPath } from 'url';

class TeamsPatchFetcher extends VendorPatchFetcher {
  constructor() {
    super('teams');
  }

  async fetchPatches() {
    try {
      this.log('Starting Microsoft Teams patch fetch via MSRC API');

      // Try current month first, fall back to previous month if not yet published
      const now = new Date();
      const months = [
        { year: now.getFullYear(), month: String(now.getMonth() + 1).padStart(2, '0') },
        { year: now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear(),
          month: String(now.getMonth() === 0 ? 12 : now.getMonth()).padStart(2, '0') }
      ];

      let response = null;
      let usedPeriod = '';
      for (const { year, month } of months) {
        const period = `${year}-${month}`;
        try {
          response = await this.fetchWithRetry(
            `https://api.msrc.microsoft.com/cvrf/v3.0/cvrf/${period}`,
            { headers: { 'Accept': 'application/json' } },
            2 // fewer retries per month attempt
          );
          usedPeriod = period;
          break;
        } catch (e) {
          this.log(`MSRC data not available for ${period}, trying previous month`, 'WARN');
        }
      }

      if (!response) {
        this.log('No MSRC data available for current or previous month');
        return await this.updatePatchData([]);
      }

      const cutoff = this.getSevenDaysAgo();
      const patches = [];
      const vulnerabilities = response.data?.Vulnerability || [];

      this.log(`MSRC returned ${vulnerabilities.length} total vulnerabilities for ${usedPeriod}`);

      for (const vuln of vulnerabilities) {
        const cve = vuln.CVE || '';
        const title = vuln.Title?.Value || cve;

        // Check if this CVE affects Teams
        const productTree = vuln.ProductStatuses || [];
        const remediations = vuln.Remediations || [];
        const allText = JSON.stringify(vuln).toLowerCase();

        if (!allText.includes('teams')) continue;

        // Get the revision date
        const revDate = vuln.RevisionHistory?.[0]?.Date;
        const pubDate = revDate ? new Date(revDate) : new Date(`${year}-${month}-01`);
        if (pubDate < cutoff) continue;

        // Extract severity from threats
        let severity = 'UNKNOWN';
        for (const threat of vuln.Threats || []) {
          if (threat.Type === 3) { // Severity
            severity = this.mapSeverity(threat.Description?.Value || '');
            break;
          }
        }

        patches.push({
          title: `${cve}: ${title}`,
          date: pubDate.toISOString().split('T')[0],
          severity,
          vendor: 'teams',
          component: 'Microsoft Teams',
          description: `Security update for Microsoft Teams - ${title}`.substring(0, 200),
          link: `https://msrc.microsoft.com/update-guide/en-US/vulnerability/${cve}`,
          cve
        });
      }

      this.log(`Found ${patches.length} Teams-related vulnerabilities`);
      return await this.updatePatchData(patches);
    } catch (error) {
      this.log(`Failed to fetch patches: ${error.message}`, 'ERROR');
      throw error;
    }
  }

  mapSeverity(sev) {
    const s = sev.toLowerCase();
    if (s === 'critical') return 'CRITICAL';
    if (s === 'important') return 'HIGH';
    if (s === 'moderate') return 'MEDIUM';
    if (s === 'low') return 'LOW';
    return 'UNKNOWN';
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const fetcher = new TeamsPatchFetcher();
  fetcher.fetchPatches().catch(console.error);
}

export default TeamsPatchFetcher;
