import axios from 'axios';
import * as cheerio from 'cheerio';
import VendorPatchFetcher from '../vendor-fetch-template.js';
import { fileURLToPath } from 'url';

class AWSPatchFetcher extends VendorPatchFetcher {
  constructor() {
    super('aws');
  }

  getSeverityFromText(text) {
    const lower = text.toLowerCase();
    if (lower.includes('critical')) return 'CRITICAL';
    if (lower.includes('important') || lower.includes('high')) return 'HIGH';
    if (lower.includes('medium') || lower.includes('moderate')) return 'MEDIUM';
    if (lower.includes('low')) return 'LOW';
    return 'UNKNOWN';
  }

  async fetchPatches() {
    try {
      this.log('Starting AWS patch fetch');
      
      // Fetch from AWS Security Bulletins RSS feed
      const response = await axios.get('https://aws.amazon.com/security/security-bulletins/feed/');
      const $ = cheerio.load(response.data, { xmlMode: true });
      
      const sevenDaysAgo = this.getSevenDaysAgo();
      const patches = [];

      // Process each item in the RSS feed
      $('item').each((i, item) => {
        const $item = $(item);
        const title = $item.find('title').text().trim();
        const description = $item.find('description').text().trim();
        const link = $item.find('link').text().trim();
        const dateStr = $item.find('pubDate').text().trim();
        
        const releaseDate = new Date(dateStr);
        if (releaseDate >= sevenDaysAgo) {
          // Extract severity from description if available
          const severity = this.getSeverityFromText(description);
          
          // Extract affected service from title (usually the first word)
          const component = title.split(' ')[0];
          
          patches.push({
            title,
            date: releaseDate.toISOString().split('T')[0],
            severity,
            vendor: 'aws',
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
  const fetcher = new AWSPatchFetcher();
  fetcher.fetchPatches().catch(console.error);
}

export default AWSPatchFetcher;
