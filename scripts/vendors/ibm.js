import VendorPatchFetcher from '../vendor-fetch-template.js';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { fileURLToPath } from 'url';

class IBMPatchFetcher extends VendorPatchFetcher {
  constructor() {
    super('ibm');
  }

  async fetchPatches() {
    try {
      // IBM Security Bulletins API
      const response = await axios.get('https://www.ibm.com/blogs/psirt/feed/');
      const $ = cheerio.load(response.data, { xmlMode: true });
      
      const patches = [];
      const sevenDaysAgo = this.getSevenDaysAgo();

      $('item').each((_, item) => {
        const $item = $(item);
        const title = $item.find('title').text();
        const link = $item.find('link').text();
        const pubDate = new Date($item.find('pubDate').text());
        const description = $item.find('description').text();

        // Only include patches from the last 7 days
        if (pubDate >= sevenDaysAgo) {
          // Extract CVE IDs from description
          const cveMatches = description.match(/CVE-\d{4}-\d{4,7}/g) || [];
          
          // Extract severity from description
          const severity = this.extractSeverity(description);

          patches.push({
            title,
            url: link,
            date: pubDate.toISOString(),
            description: this.cleanDescription(description),
            severity,
            vendor: 'ibm',
            cve: [...new Set(cveMatches)], // Remove duplicates
            affected_products: this.extractAffectedProducts(description)
          });
        }
      });

      return this.updatePatchData(patches);
    } catch (error) {
      this.log(`Error fetching patches: ${error.message}`, 'ERROR');
      throw error;
    }
  }

  cleanDescription(description) {
    // Remove HTML tags and decode entities
    return description
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .trim();
  }

  extractSeverity(description) {
    const lower = description.toLowerCase();
    if (lower.includes('critical')) return 'Critical';
    if (lower.includes('high')) return 'High';
    if (lower.includes('medium')) return 'Medium';
    if (lower.includes('low')) return 'Low';
    return 'Unknown';
  }

  extractAffectedProducts(description) {
    const products = [];
    const lines = description.split('\n');
    
    // Look for lines that typically list affected products
    for (const line of lines) {
      const lower = line.toLowerCase();
      if (lower.includes('affected product') || lower.includes('affected component')) {
        // Extract product names after the colon
        const match = line.match(/:(.*)/);
        if (match) {
          const productList = match[1].split(',').map(p => p.trim());
          products.push(...productList);
        }
      }
    }

    return products.length > 0 ? products : ['IBM Products'];
  }
}

// Run the fetcher if this script is called directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const fetcher = new IBMPatchFetcher();
  fetcher.fetchPatches().catch(console.error);
}

export default IBMPatchFetcher;
