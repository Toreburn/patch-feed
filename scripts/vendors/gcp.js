import axios from 'axios';
import * as cheerio from 'cheerio';
import { fileURLToPath } from 'url';
import VendorPatchFetcher from '../vendor-fetch-template.js';

class GCPPatchFetcher extends VendorPatchFetcher {
  constructor() {
    super('gcp');
  }

  async fetchPatches() {
    try {
      this.log('Starting GCP patch fetch via security bulletins XML feeds');

      const patches = [];
      const sevenDaysAgo = this.getSevenDaysAgo();

      // GCP has multiple XML feeds for different products
      const feeds = [
        {
          url: 'https://cloud.google.com/feeds/kubernetes-engine-security-bulletins.xml',
          product: 'GKE'
        },
        {
          url: 'https://cloud.google.com/feeds/compute-security-bulletins.xml',
          product: 'Compute Engine'
        }
      ];

      for (const feed of feeds) {
        try {
          const response = await axios.get(feed.url, { timeout: 30000 });
          const $ = cheerio.load(response.data, { xmlMode: true });

          $('entry').each((_, entry) => {
            const $entry = $(entry);
            const title = $entry.find('title').text().trim();
            const updated = new Date($entry.find('updated').text());
            const link = $entry.find('link').attr('href');
            const content = $entry.find('content').text();

            if (updated >= sevenDaysAgo) {
              // Extract CVEs from content
              const cves = content.match(/CVE-\d{4}-\d+/g) || [];

              // Determine severity from content
              let severity = 'UNKNOWN';
              const contentLower = content.toLowerCase();
              if (contentLower.includes('critical')) severity = 'CRITICAL';
              else if (contentLower.includes('high')) severity = 'HIGH';
              else if (contentLower.includes('medium') || contentLower.includes('moderate')) severity = 'MEDIUM';
              else if (contentLower.includes('low')) severity = 'LOW';

              patches.push({
                title: `${feed.product}: ${title}`,
                date: updated.toISOString().split('T')[0],
                severity,
                vendor: 'gcp',
                component: feed.product,
                description: `Security bulletin for ${feed.product}: ${cves.length > 0 ? cves.slice(0, 3).join(', ') : 'See bulletin for details'}`,
                link,
                cves
              });
            }
          });
        } catch (feedError) {
          this.log(`Error fetching ${feed.product} feed: ${feedError.message}`, 'WARN');
        }
      }

      if (patches.length === 0) {
        this.log('No new patches found in the last 7 days');
      } else {
        this.log(`Found ${patches.length} security bulletins`);
      }

      return await this.updatePatchData(patches);
    } catch (error) {
      this.log(`Failed to fetch patches: ${error.message}`, 'ERROR');
      throw error;
    }
  }
}

// Execute if run directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const fetcher = new GCPPatchFetcher();
  fetcher.fetchPatches().catch(console.error);
}

export default GCPPatchFetcher;
