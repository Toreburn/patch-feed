import axios from 'axios';
import * as cheerio from 'cheerio';
import VendorPatchFetcher from '../vendor-fetch-template.js';
import { fileURLToPath } from 'url';

class ChromePatchFetcher extends VendorPatchFetcher {
  constructor() {
    super('chrome');
  }

  async fetchPatches() {
    try {
      this.log('Starting Chrome patch fetch');
      
      // Fetch from Chrome Release Notes
      const response = await axios.get('https://chromereleases.googleblog.com/search/label/Stable%20updates');
      const $ = cheerio.load(response.data);
      
      const sevenDaysAgo = this.getSevenDaysAgo();
      const patches = [];

      // Process each blog post
      $('.post').each((i, post) => {
        const $post = $(post);
        const title = $post.find('.post-title').text().trim();
        const dateStr = $post.find('.published').attr('title');
        const content = $post.find('.post-body').text().trim();
        const link = $post.find('.post-title a').attr('href');
        
        const releaseDate = new Date(dateStr);
        
        // Only include Chrome browser updates
        if (releaseDate >= sevenDaysAgo && title.includes('Chrome')) {
          // Determine severity based on content
          let severity = 'UNKNOWN';
          const contentLower = content.toLowerCase();
          if (contentLower.includes('critical')) severity = 'CRITICAL';
          else if (contentLower.includes('high')) severity = 'HIGH';
          else if (contentLower.includes('medium')) severity = 'MEDIUM';
          else if (contentLower.includes('low')) severity = 'LOW';
          
          patches.push({
            title,
            date: releaseDate.toISOString().split('T')[0],
            severity,
            vendor: 'chrome',
            component: 'Chrome Browser',
            description: content.substring(0, 200) + '...',
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
  const fetcher = new ChromePatchFetcher();
  fetcher.fetchPatches().catch(console.error);
}

export default ChromePatchFetcher;
