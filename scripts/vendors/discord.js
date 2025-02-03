import VendorPatchFetcher from '../vendor-fetch-template.js';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { fileURLToPath } from 'url';

class DiscordPatchFetcher extends VendorPatchFetcher {
  constructor() {
    super('discord');
  }

  async fetchPatches() {
    try {
      // Discord Security Advisories Blog
      const response = await axios.get('https://discord.com/blog/category/security');
      const $ = cheerio.load(response.data);
      
      const patches = [];
      const sevenDaysAgo = this.getSevenDaysAgo();

      // Discord blog posts are in article elements
      $('article').each((_, article) => {
        const $article = $(article);
        const title = $article.find('h2').text().trim();
        const dateStr = $article.find('time').attr('datetime');
        const link = $article.find('a').attr('href');
        const description = $article.find('p').first().text().trim();
        
        if (dateStr) {
          const pubDate = new Date(dateStr);
          
          // Only include patches from the last 7 days
          if (pubDate >= sevenDaysAgo) {
            patches.push({
              title,
              url: link ? new URL(link, 'https://discord.com').href : 'https://discord.com/blog/category/security',
              date: pubDate.toISOString(),
              description: this.cleanDescription(description),
              severity: this.extractSeverity(description),
              vendor: 'discord',
              affected_products: ['Discord'],
              cve: this.extractCVEs(description),
              platform: this.extractPlatforms(description)
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

  cleanDescription(description) {
    return description
      .replace(/\s+/g, ' ')
      .trim();
  }

  extractSeverity(text) {
    const lower = text.toLowerCase();
    if (lower.includes('critical')) return 'Critical';
    if (lower.includes('high')) return 'High';
    if (lower.includes('medium')) return 'Medium';
    if (lower.includes('low')) return 'Low';
    return 'Unknown';
  }

  extractCVEs(text) {
    const cveMatches = text.match(/CVE-\d{4}-\d{4,7}/g) || [];
    return [...new Set(cveMatches)];
  }

  extractPlatforms(text) {
    const platforms = new Set();
    const lower = text.toLowerCase();
    
    if (lower.includes('desktop') || lower.includes('windows') || lower.includes('macos') || lower.includes('linux')) {
      platforms.add('Desktop');
    }
    if (lower.includes('mobile') || lower.includes('ios') || lower.includes('android')) {
      platforms.add('Mobile');
    }
    if (lower.includes('web') || lower.includes('browser')) {
      platforms.add('Web');
    }

    return platforms.size > 0 ? Array.from(platforms) : ['All Platforms'];
  }
}

// Run the fetcher if this script is called directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const fetcher = new DiscordPatchFetcher();
  fetcher.fetchPatches().catch(console.error);
}

export default DiscordPatchFetcher;
