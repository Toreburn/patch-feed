import axios from 'axios';
import * as cheerio from 'cheerio';
import { fileURLToPath } from 'url';
import VendorPatchFetcher from '../vendor-fetch-template.js';

class MicrosoftPatchFetcher extends VendorPatchFetcher {
  constructor() {
    super('microsoft');
  }

  async fetchPatches() {
    try {
      this.log('Starting Microsoft patch fetch');
      
      const response = await axios.get('https://msrc.microsoft.com/update-guide/releaseNote');
      const $ = cheerio.load(response.data);
      const sevenDaysAgo = this.getSevenDaysAgo();
      const patches = [];

      // Parse the security updates
      $('.release-note-card').each((i, elem) => {
        const title = $(elem).find('.release-note-title').text().trim();
        const dateStr = $(elem).find('.release-note-date').text().trim();
        const description = $(elem).find('.release-note-description').text().trim();
        const link = 'https://msrc.microsoft.com' + $(elem).find('a').attr('href');
        
        const releaseDate = new Date(dateStr);
        
        if (releaseDate >= sevenDaysAgo) {
          patches.push({
            title,
            date: releaseDate.toISOString().split('T')[0],
            severity: "Critical",
            vendor: "microsoft",
            component: "Windows, Office, Exchange Server",
            description: description || `${title} addresses multiple vulnerabilities in Microsoft products`,
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
}

// Execute if run directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const fetcher = new MicrosoftPatchFetcher();
  fetcher.fetchPatches().catch(console.error);
}

export default MicrosoftPatchFetcher;
