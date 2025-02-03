import axios from 'axios';
import * as cheerio from 'cheerio';
import VendorPatchFetcher from '../vendor-fetch-template.js';
import { fileURLToPath } from 'url';

class PostgreSQLPatchFetcher extends VendorPatchFetcher {
  constructor() {
    super('postgresql');
  }

  async fetchPatches() {
    try {
      this.log('Starting PostgreSQL patch fetch');
      
      // Fetch from PostgreSQL Security page
      const response = await axios.get('https://www.postgresql.org/support/security/');
      const $ = cheerio.load(response.data);
      
      const sevenDaysAgo = this.getSevenDaysAgo();
      const patches = [];

      // Each security advisory is in a table row
      $('table.table tr').each((i, elem) => {
        // Skip header row
        if (i === 0) return;
        
        const $cols = $(elem).find('td');
        if ($cols.length < 4) return;

        const dateStr = $cols.eq(0).text().trim();
        const advisory = $cols.eq(1).text().trim();
        const versions = $cols.eq(2).text().trim();
        const description = $cols.eq(3).text().trim();
        const link = 'https://www.postgresql.org' + $cols.eq(1).find('a').attr('href');
        
        const releaseDate = new Date(dateStr);
        
        if (releaseDate >= sevenDaysAgo) {
          patches.push({
            title: `PostgreSQL Security Advisory ${advisory}`,
            date: releaseDate.toISOString().split('T')[0],
            severity: this.determineSeverity(description),
            vendor: 'postgresql',
            component: `PostgreSQL ${versions}`,
            description: description.substring(0, 200) + '...',
            link
          });
        }
      });

      if (patches.length === 0) {
        this.log('No new patches found in the last 7 days');
      }

      return await this.updatePatchData(patches);
    } catch (error) {
      this.log(`Failed to fetch patches: ${error.message}`, 'ERROR');
      if (error.response) {
        this.log(`Response status: ${error.response.status}`, 'ERROR');
        this.log(`Response data: ${JSON.stringify(error.response.data)}`, 'ERROR');
      }
      throw error;
    }
  }

  determineSeverity(description) {
    const lowercaseDesc = description.toLowerCase();
    if (lowercaseDesc.includes('critical') || lowercaseDesc.includes('remote code execution')) {
      return 'CRITICAL';
    } else if (lowercaseDesc.includes('high') || lowercaseDesc.includes('privilege escalation')) {
      return 'HIGH';
    } else if (lowercaseDesc.includes('medium') || lowercaseDesc.includes('denial of service')) {
      return 'MEDIUM';
    } else if (lowercaseDesc.includes('low')) {
      return 'LOW';
    }
    return 'UNKNOWN';
  }
}

// Execute if run directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const fetcher = new PostgreSQLPatchFetcher();
  fetcher.fetchPatches().catch(console.error);
}

export default PostgreSQLPatchFetcher;
