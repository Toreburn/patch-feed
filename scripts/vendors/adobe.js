import axios from 'axios';
import * as cheerio from 'cheerio';
import VendorPatchFetcher from '../vendor-fetch-template.js';
import { fileURLToPath } from 'url';

class AdobePatchFetcher extends VendorPatchFetcher {
  constructor() {
    super('adobe');
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
      this.log('Starting Adobe patch fetch');
      
      // Fetch from Adobe Security Bulletins
      const response = await axios.get('https://helpx.adobe.com/security.html');
      const $ = cheerio.load(response.data);
      
      const sevenDaysAgo = this.getSevenDaysAgo();
      const patches = [];

      // Process each bulletin
      $('.security-bulletin').each((i, bulletin) => {
        const $bulletin = $(bulletin);
        const title = $bulletin.find('.bulletin-title').text().trim();
        const dateStr = $bulletin.find('.bulletin-date').text().trim();
        const description = $bulletin.find('.bulletin-description').text().trim();
        const severity = this.getSeverityFromText($bulletin.find('.bulletin-severity').text().trim());
        const link = 'https://helpx.adobe.com' + $bulletin.find('a').attr('href');
        
        const releaseDate = new Date(dateStr);
        if (releaseDate >= sevenDaysAgo) {
          patches.push({
            title,
            date: releaseDate.toISOString().split('T')[0],
            severity,
            vendor: 'adobe',
            component: title.split(' ')[0], // Usually the product name
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
  const fetcher = new AdobePatchFetcher();
  fetcher.fetchPatches().catch(console.error);
}

export default AdobePatchFetcher;
