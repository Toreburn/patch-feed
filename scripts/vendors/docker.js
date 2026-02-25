import * as cheerio from 'cheerio';
import VendorPatchFetcher from '../vendor-fetch-template.js';
import { fileURLToPath } from 'url';

class DockerPatchFetcher extends VendorPatchFetcher {
  constructor() {
    super('docker');
  }

  async fetchPatches() {
    try {
      this.log('Starting Docker patch fetch via security advisories and NVD');

      const cutoff = this.getSevenDaysAgo();
      const patches = [];

      // Docker publishes CVEs on their docs site and GitHub
      try {
        const response = await this.fetchWithRetry(
          'https://docs.docker.com/security/'
        );
        const $ = cheerio.load(response.data);

        $('a[href*="CVE"], a[href*="security"], a[href*="advisory"]').each((i, el) => {
          const $el = $(el);
          const title = $el.text().trim();
          const href = $el.attr('href') || '';

          if (!title || title.length < 5) return;

          const parentText = $el.parent().text() || '';
          const dateMatch = parentText.match(/(\d{4}-\d{2}-\d{2})/);
          const pubDate = dateMatch ? new Date(dateMatch[1]) : null;

          if (!pubDate || isNaN(pubDate.getTime()) || pubDate < cutoff) return;

          const cves = this.extractCVEs(title + ' ' + parentText);
          const fullLink = href.startsWith('http') ? href : `https://docs.docker.com${href}`;

          patches.push({
            title: `Docker: ${title.substring(0, 120)}`,
            date: pubDate.toISOString().split('T')[0],
            severity: this.getSeverityFromText(title + ' ' + parentText),
            vendor: 'docker',
            component: this.extractComponent(title + ' ' + parentText),
            description: title.substring(0, 200),
            link: fullLink,
            cve: cves[0] || ''
          });
        });
      } catch (e) {
        this.log(`Docker docs fetch failed: ${e.message}`, 'WARN');
      }

      this.log(`Found ${patches.length} Docker security advisories`);
      return await this.updatePatchData(patches);
    } catch (error) {
      this.log(`Failed to fetch patches: ${error.message}`, 'ERROR');
      throw error;
    }
  }

  extractComponent(text) {
    const lower = text.toLowerCase();
    if (lower.includes('docker desktop')) return 'Docker Desktop';
    if (lower.includes('docker engine') || lower.includes('dockerd')) return 'Docker Engine';
    if (lower.includes('containerd')) return 'containerd';
    if (lower.includes('docker compose') || lower.includes('docker-compose')) return 'Docker Compose';
    if (lower.includes('buildkit')) return 'BuildKit';
    if (lower.includes('moby')) return 'Moby';
    if (lower.includes('runc')) return 'runc';
    return 'Docker';
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const fetcher = new DockerPatchFetcher();
  fetcher.fetchPatches().catch(console.error);
}

export default DockerPatchFetcher;
