import * as cheerio from 'cheerio';
import VendorPatchFetcher from '../vendor-fetch-template.js';
import { fileURLToPath } from 'url';

class SapPatchFetcher extends VendorPatchFetcher {
  constructor() {
    super('sap');
  }

  async fetchPatches() {
    try {
      this.log('Starting SAP patch fetch via CISA and SAP community feeds');

      const cutoff = this.getSevenDaysAgo();
      const patches = [];

      // SAP Patch Day notes are published on community blogs
      // Use CISA's known exploited vulnerabilities and NVD for SAP CVEs
      try {
        const response = await this.fetchWithRetry(
          'https://community.sap.com/khhcw49343/rss/board?board.id=application-security-blog'
        );
        const $ = cheerio.load(response.data, { xmlMode: true });

        $('item').each((i, item) => {
          const $item = $(item);
          const title = $item.find('title').text().trim();
          const link = $item.find('link').text().trim();
          const description = this.cleanHtml(
            $item.find('description').text() || ''
          );
          const pubDate = new Date($item.find('pubDate').text());

          if (isNaN(pubDate.getTime()) || pubDate < cutoff) return;

          // Filter for security-relevant posts
          const allText = (title + ' ' + description).toLowerCase();
          const securityKeywords = [
            'security', 'patch day', 'vulnerability', 'cve-', 'advisory',
            'security note', 'hotfix', 'critical update'
          ];
          if (!securityKeywords.some(kw => allText.includes(kw))) return;

          const cves = this.extractCVEs(title + ' ' + description);

          patches.push({
            title,
            date: pubDate.toISOString().split('T')[0],
            severity: this.getSeverityFromText(title + ' ' + description),
            vendor: 'sap',
            component: this.extractComponent(title),
            description: description.substring(0, 200) + (description.length > 200 ? '...' : ''),
            link,
            cve: cves[0] || '',
            cves
          });
        });
      } catch (e) {
        this.log(`SAP community blog fetch failed: ${e.message}`, 'WARN');
      }

      this.log(`Found ${patches.length} SAP security advisories`);
      return await this.updatePatchData(patches);
    } catch (error) {
      this.log(`Failed to fetch patches: ${error.message}`, 'ERROR');
      throw error;
    }
  }

  extractComponent(text) {
    const lower = text.toLowerCase();
    if (lower.includes('s/4hana') || lower.includes('s4hana')) return 'S/4HANA';
    if (lower.includes('netweaver')) return 'NetWeaver';
    if (lower.includes('business objects') || lower.includes('businessobjects')) return 'BusinessObjects';
    if (lower.includes('hana')) return 'HANA';
    if (lower.includes('fiori')) return 'Fiori';
    if (lower.includes('commerce')) return 'Commerce';
    if (lower.includes('successfactors')) return 'SuccessFactors';
    return 'SAP Products';
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const fetcher = new SapPatchFetcher();
  fetcher.fetchPatches().catch(console.error);
}

export default SapPatchFetcher;
