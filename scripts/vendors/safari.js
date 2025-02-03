import VendorPatchFetcher from '../vendor-fetch-template.js';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { fileURLToPath } from 'url';

class SafariPatchFetcher extends VendorPatchFetcher {
  constructor() {
    super('safari');
  }

  async fetchPatches() {
    try {
      // Apple Security Updates page
      const response = await axios.get('https://support.apple.com/en-us/HT201222');
      const $ = cheerio.load(response.data);
      
      const patches = [];
      const sevenDaysAgo = this.getSevenDaysAgo();

      // Apple lists their security updates in tables
      $('.table-simple').each((_, table) => {
        $(table).find('tr').each((_, row) => {
          const $row = $(row);
          const cells = $row.find('td');
          
          if (cells.length >= 2) {
            const dateStr = $(cells[0]).text().trim();
            const title = $(cells[1]).text().trim();
            
            // Only process Safari-related updates
            if (title.toLowerCase().includes('safari')) {
              // Parse the date (format: Month DD, YYYY)
              const pubDate = new Date(dateStr);
              
              if (!isNaN(pubDate.getTime()) && pubDate >= sevenDaysAgo) {
                // Extract link if present
                const $link = $(cells[1]).find('a');
                const url = $link.length ? 
                  new URL($link.attr('href'), 'https://support.apple.com').href : 
                  'https://support.apple.com/en-us/HT201222';

                // Extract version from title
                const versionMatch = title.match(/Safari\s+([\d.]+)/i);
                const version = versionMatch ? versionMatch[1] : '';

                patches.push({
                  title,
                  url,
                  date: pubDate.toISOString(),
                  description: this.extractDescription($, url),
                  severity: 'Unknown', // Apple doesn't typically provide severity in the main feed
                  vendor: 'safari',
                  affected_products: ['Safari'],
                  version: version,
                  platform: this.extractPlatform(title)
                });
              }
            }
          }
        });
      });

      return this.updatePatchData(patches);
    } catch (error) {
      this.log(`Error fetching patches: ${error.message}`, 'ERROR');
      throw error;
    }
  }

  async extractDescription($, url) {
    try {
      if (!url || url === 'https://support.apple.com/en-us/HT201222') {
        return 'Security update for Safari. See Apple Security Updates page for details.';
      }

      // Fetch the specific update page
      const response = await axios.get(url);
      const $detail = cheerio.load(response.data);
      
      // Try to find the security content section
      const description = $detail('#content').text().trim();
      return description || 'See update page for details.';
    } catch (error) {
      this.log(`Error fetching update details: ${error.message}`, 'WARN');
      return 'See update page for details.';
    }
  }

  extractPlatform(title) {
    const platforms = [];
    const lower = title.toLowerCase();
    
    if (lower.includes('macos') || lower.includes('mac os')) {
      platforms.push('macOS');
    }
    if (lower.includes('ios')) {
      platforms.push('iOS');
    }
    if (lower.includes('ipados')) {
      platforms.push('iPadOS');
    }

    return platforms.length > 0 ? platforms : ['macOS'];
  }
}

// Run the fetcher if this script is called directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const fetcher = new SafariPatchFetcher();
  fetcher.fetchPatches().catch(console.error);
}

export default SafariPatchFetcher;
