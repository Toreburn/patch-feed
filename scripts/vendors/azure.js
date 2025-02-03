import axios from 'axios';
import * as cheerio from 'cheerio';
import VendorPatchFetcher from '../vendor-fetch-template.js';
import { fileURLToPath } from 'url';

class AzurePatchFetcher extends VendorPatchFetcher {
  constructor() {
    super('azure');
  }

  getSeverityFromText(text) {
    const lower = text.toLowerCase();
    if (lower.includes('critical')) return 'CRITICAL';
    if (lower.includes('important')) return 'HIGH';
    if (lower.includes('moderate')) return 'MEDIUM';
    if (lower.includes('low')) return 'LOW';
    return 'UNKNOWN';
  }

  async fetchPatches() {
    try {
      this.log('Starting Azure patch fetch');
      
      // Fetch from Azure Security Updates
      const response = await axios.get('https://azure.microsoft.com/en-us/updates/?query=security');
      const $ = cheerio.load(response.data);
      
      const sevenDaysAgo = this.getSevenDaysAgo();
      const patches = [];

      // Process each update
      $('.azure-update-item').each((i, item) => {
        const $item = $(item);
        const title = $item.find('.update-title').text().trim();
        const description = $item.find('.update-description').text().trim();
        const dateStr = $item.find('.update-date').text().trim();
        const link = 'https://azure.microsoft.com' + $item.find('a').attr('href');
        
        const releaseDate = new Date(dateStr);
        if (releaseDate >= sevenDaysAgo) {
          // Extract severity from description if available
          const severity = this.getSeverityFromText(description);
          
          // Extract affected service from title (usually the first part)
          const component = title.split(':')[0].trim();
          
          patches.push({
            title,
            date: releaseDate.toISOString().split('T')[0],
            severity,
            vendor: 'azure',
            component,
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
}

// Execute if run directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const fetcher = new AzurePatchFetcher();
  fetcher.fetchPatches().catch(console.error);
}

export default AzurePatchFetcher;
