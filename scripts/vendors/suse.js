import * as cheerio from 'cheerio';
import VendorPatchFetcher from '../vendor-fetch-template.js';
import { fileURLToPath } from 'url';

class SusePatchFetcher extends VendorPatchFetcher {
  constructor() {
    super('suse');
  }

  async fetchPatches() {
    try {
      this.log('Starting SUSE patch fetch via CVRF directory');

      const cutoff = this.getSevenDaysAgo();
      const patches = [];

      // Step 1: Fetch the CVRF directory listing to find recent files
      const dirResp = await this.fetchWithRetry(
        'https://ftp.suse.com/pub/projects/security/cvrf/',
        {
          headers: { 'User-Agent': 'PatchFeedBot/1.0' },
          timeout: 30000
        }
      );
      const $dir = cheerio.load(dirResp.data);

      // Collect recent CVRF files — filenames are like suse-su-2026:0001-1.json or similar
      // The directory lists files with dates; collect those in our lookback window
      const recentFiles = [];
      $dir('a[href]').each((i, el) => {
        const href = $dir(el).attr('href');
        if (!href || !href.endsWith('.json')) return;

        // Check modification date from the directory listing text
        const parentText = $dir(el).parent().text();
        const dateMatch = parentText.match(/(\d{4}-\d{2}-\d{2})/);
        if (dateMatch) {
          const fileDate = new Date(dateMatch[1]);
          if (fileDate >= cutoff) {
            recentFiles.push(href);
          }
        }
      });

      this.log(`Found ${recentFiles.length} recent CVRF files`);

      // Step 2: Fetch and parse each recent CVRF file (limit to avoid timeouts)
      const filesToFetch = recentFiles.slice(0, 20);

      for (const file of filesToFetch) {
        try {
          const fileUrl = `https://ftp.suse.com/pub/projects/security/cvrf/${file}`;
          const resp = await this.fetchWithRetry(fileUrl, { timeout: 15000 });
          const data = typeof resp.data === 'string' ? JSON.parse(resp.data) : resp.data;

          // Parse CVRF JSON format
          const docTitle = data?.document?.title || data?.Title || file;
          const releaseDate = new Date(
            data?.document?.tracking?.current_release_date ||
            data?.DocumentTracking?.CurrentReleaseDate || ''
          );

          if (isNaN(releaseDate.getTime()) || releaseDate < cutoff) continue;

          const vulns = data?.vulnerabilities || data?.Vulnerability || [];
          const cveIds = vulns.map(v => v.cve || v.CVE).filter(Boolean);

          // Aggregate severity from threats
          let severity = 'UNKNOWN';
          for (const vuln of vulns) {
            const threats = vuln.threats || vuln.Threats || [];
            for (const threat of threats) {
              const text = threat.text || threat.Description?.Value || '';
              const s = this.getSeverityFromText(text);
              if (s !== 'UNKNOWN') { severity = s; break; }
            }
            if (severity !== 'UNKNOWN') break;
          }

          patches.push({
            title: docTitle.substring(0, 150),
            date: releaseDate.toISOString().split('T')[0],
            severity,
            vendor: 'suse',
            component: 'SUSE Linux',
            description: `SUSE security update: ${docTitle}`.substring(0, 200),
            link: `https://www.suse.com/security/cve/`,
            cve: cveIds[0] || ''
          });
        } catch (err) {
          this.log(`Failed to parse ${file}: ${err.message}`, 'WARN');
        }
      }

      // Fallback: If CVRF approach fails, try the SUSE security RSS
      if (patches.length === 0) {
        this.log('CVRF empty, trying SUSE update RSS feed');
        try {
          const rssResp = await this.fetchWithRetry(
            'https://www.suse.com/support/update/'
          );
          const $rss = cheerio.load(rssResp.data);

          $rss('a[href*="/support/update/"]').each((i, el) => {
            const $a = $rss(el);
            const title = $a.text().trim();
            const href = $a.attr('href') || '';

            if (!title || title.length < 10) return;
            if (!title.toLowerCase().includes('security') && !title.toLowerCase().includes('suse')) return;

            const parentText = $a.closest('div, tr, li').text();
            const dateMatch = parentText.match(/\d{4}-\d{2}-\d{2}/) ||
              parentText.match(/(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}/i);

            const pubDate = dateMatch ? new Date(dateMatch[0]) : null;
            if (!pubDate || isNaN(pubDate.getTime()) || pubDate < cutoff) return;

            const link = href.startsWith('http') ? href : `https://www.suse.com${href}`;

            patches.push({
              title,
              date: pubDate.toISOString().split('T')[0],
              severity: this.getSeverityFromText(title),
              vendor: 'suse',
              component: 'SUSE Linux',
              description: `SUSE security update: ${title}`,
              link
            });
          });
        } catch (err) {
          this.log(`SUSE updates page fallback failed: ${err.message}`, 'WARN');
        }
      }

      this.log(`Found ${patches.length} SUSE security updates`);
      return await this.updatePatchData(patches);
    } catch (error) {
      this.log(`Failed to fetch patches: ${error.message}`, 'ERROR');
      throw error;
    }
  }
}

export default SusePatchFetcher;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const fetcher = new SusePatchFetcher();
  fetcher.fetchPatches().catch(console.error);
}
