import VendorPatchFetcher from '../vendor-fetch-template.js';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { fileURLToPath } from 'url';

class OracleCloudPatchFetcher extends VendorPatchFetcher {
  constructor() {
    super('oracle-cloud');
  }

  async fetchPatches() {
    try {
      // Oracle Cloud Security Advisories
      const response = await axios.get('https://docs.oracle.com/en-us/iaas/Content/Security/Reference/security_advisories.htm');
      const $ = cheerio.load(response.data);
      
      const patches = [];
      const sevenDaysAgo = this.getSevenDaysAgo();

      // Oracle Cloud structures their advisories in a table
      $('table tr').each((_, row) => {
        const $row = $(row);
        const cells = $row.find('td');
        
        if (cells.length >= 4) { // Ensure we have enough cells
          const dateStr = $(cells[0]).text().trim();
          const title = $(cells[1]).text().trim();
          const severity = $(cells[2]).text().trim();
          const description = $(cells[3]).text().trim();
          
          // Parse the date (assuming format MM/DD/YYYY)
          const pubDate = new Date(dateStr);
          
          // Only include patches from the last 7 days
          if (!isNaN(pubDate.getTime()) && pubDate >= sevenDaysAgo) {
            // Extract CVE IDs from description
            const cveMatches = description.match(/CVE-\d{4}-\d{4,7}/g) || [];
            
            // Extract URL if present
            const $link = $(cells[1]).find('a');
            const url = $link.length ? new URL($link.attr('href'), 'https://docs.oracle.com').href : '';

            patches.push({
              title,
              url: url || 'https://docs.oracle.com/en-us/iaas/Content/Security/Reference/security_advisories.htm',
              date: pubDate.toISOString(),
              description,
              severity: this.mapSeverity(severity),
              vendor: 'oracle-cloud',
              cve: [...new Set(cveMatches)], // Remove duplicates
              affected_products: ['Oracle Cloud Infrastructure'],
              references: url ? [url] : []
            });
          }
        }
      });

      return this.updatePatchData(patches);
    } catch (error) {
      this.log(`Error fetching patches: ${error.message}`, 'ERROR');
      throw error;
    }
  }

  mapSeverity(severity) {
    const severityMap = {
      'CRITICAL': 'Critical',
      'HIGH': 'High',
      'MEDIUM': 'Medium',
      'LOW': 'Low',
      'IMPORTANT': 'High',
      'MODERATE': 'Medium'
    };
    return severityMap[severity.toUpperCase()] || 'Unknown';
  }
}

// Run the fetcher if this script is called directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const fetcher = new OracleCloudPatchFetcher();
  fetcher.fetchPatches().catch(console.error);
}

export default OracleCloudPatchFetcher;
