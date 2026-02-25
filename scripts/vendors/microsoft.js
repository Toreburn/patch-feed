import axios from 'axios';
import { fileURLToPath } from 'url';
import VendorPatchFetcher from '../vendor-fetch-template.js';

class MicrosoftPatchFetcher extends VendorPatchFetcher {
  constructor() {
    super('microsoft');
  }

  async fetchPatches() {
    try {
      this.log('Starting Microsoft patch fetch via MSRC CVRF API');

      // Get current and previous month for API calls
      const now = new Date();
      const currentMonth = `${now.getFullYear()}-${now.toLocaleString('en-US', { month: 'short' })}`;

      const patches = [];
      const sevenDaysAgo = this.getSevenDaysAgo();

      // Fetch current month's CVRF data
      try {
        const response = await axios.get(
          `https://api.msrc.microsoft.com/cvrf/v3.0/cvrf/${currentMonth}`,
          {
            headers: { 'Accept': 'application/json' },
            timeout: 30000
          }
        );

        const data = response.data;
        const releaseDate = new Date(data.DocumentTracking?.CurrentReleaseDate || now);

        // Only include if within the last 7 days
        if (releaseDate >= sevenDaysAgo) {
          // Parse vulnerabilities from the CVRF document
          const vulnerabilities = data.Vulnerability || [];

          for (const vuln of vulnerabilities.slice(0, 50)) { // Limit to 50 CVEs per run
            const cveId = vuln.CVE || 'Unknown';
            const title = vuln.Title?.Value || cveId;

            // Get severity from threats
            let severity = 'UNKNOWN';
            const threats = vuln.Threats || [];
            for (const threat of threats) {
              if (threat.Type === 3) { // Severity
                const severityText = threat.Description?.Value?.toLowerCase() || '';
                if (severityText.includes('critical')) severity = 'CRITICAL';
                else if (severityText.includes('important') || severityText.includes('high')) severity = 'HIGH';
                else if (severityText.includes('moderate') || severityText.includes('medium')) severity = 'MEDIUM';
                else if (severityText.includes('low')) severity = 'LOW';
                break;
              }
            }

            // Get affected products
            const productStatuses = vuln.ProductStatuses || [];
            let component = 'Windows';
            for (const ps of productStatuses) {
              if (ps.ProductID && ps.ProductID.length > 0) {
                // Just use the first product category as component
                component = 'Multiple Microsoft Products';
                break;
              }
            }

            patches.push({
              title: `${cveId}: ${title}`,
              date: releaseDate.toISOString().split('T')[0],
              severity,
              vendor: 'microsoft',
              component,
              description: vuln.Notes?.find(n => n.Type === 1)?.Value?.substring(0, 200) || `Security update for ${cveId}`,
              link: `https://msrc.microsoft.com/update-guide/en-US/vulnerability/${cveId}`
            });
          }
        }

        this.log(`Found ${patches.length} CVEs from MSRC API`);
      } catch (apiError) {
        this.log(`MSRC API error: ${apiError.message}`, 'WARN');
        // Fallback: create a summary patch entry
        if (apiError.response?.status !== 404) {
          throw apiError;
        }
      }

      if (patches.length === 0) {
        this.log('No new patches found in the last 7 days');
      }

      return await this.updatePatchData(patches);
    } catch (error) {
      this.log(`Failed to fetch patches: ${error.message}`, 'ERROR');
      throw error;
    }
  }
}

// Execute if run directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const fetcher = new MicrosoftPatchFetcher();
  fetcher.fetchPatches().catch(console.error);
}

export default MicrosoftPatchFetcher;
