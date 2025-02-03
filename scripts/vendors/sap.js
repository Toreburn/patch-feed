import axios from 'axios';
import * as cheerio from 'cheerio';
import VendorPatchFetcher from '../vendor-fetch-template.js';
import { fileURLToPath } from 'url';

class SAPPatchFetcher extends VendorPatchFetcher {
  constructor() {
    super('sap');
    this.headers = {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      'Accept': 'application/xml, text/xml, */*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache'
    };
  }

  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async fetchWithRetry(url, maxRetries = 3) {
    for (let i = 0; i < maxRetries; i++) {
      try {
        const response = await axios.get(url, { headers: this.headers });
        await this.sleep(2000); // Wait 2 seconds between requests
        return response;
      } catch (error) {
        if (i === maxRetries - 1) throw error;
        await this.sleep(5000); // Wait 5 seconds before retry
        this.log(`Retrying request to ${url} (attempt ${i + 2}/${maxRetries})`, 'INFO');
      }
    }
  }

  async fetchPatches() {
    try {
      this.log('Starting SAP patch fetch');
      const patches = [];
      const sevenDaysAgo = this.getSevenDaysAgo();

      // Fetch from SAP's Security Advisory RSS feed
      const response = await this.fetchWithRetry('https://support.sap.com/content/support-portal-news/security-advisories.rss.xml');
      const $ = cheerio.load(response.data, { xmlMode: true });
      
      // Process each security advisory
      $('item').each((i, item) => {
        const $item = $(item);
        const title = $item.find('title').text().trim();
        const description = $item.find('description').text().trim();
        const link = $item.find('link').text().trim();
        const pubDate = new Date($item.find('pubDate').text().trim());
        
        if (pubDate < sevenDaysAgo) return;

        // Extract CVSS score if available
        const cvssMatch = description.match(/CVSS\s*(?:v\d\s*)?(?:Score|Base):\s*(\d+(?:\.\d+)?)/i);
        const cvssScore = cvssMatch ? parseFloat(cvssMatch[1]) : null;

        patches.push({
          title: `SAP Security Advisory: ${title}`,
          date: pubDate.toISOString().split('T')[0],
          severity: cvssScore ? this.mapCVSSScore(cvssScore) : this.determineSeverity(description),
          vendor: 'sap',
          component: this.determineComponent(description),
          description: description.substring(0, 200) + '...',
          link
        });
      });

      // Also fetch from SAP's Security Patch Day RSS feed
      const patchDayResponse = await this.fetchWithRetry('https://support.sap.com/content/support-portal-news/security-patch-day.rss.xml');
      const $patchDay = cheerio.load(patchDayResponse.data, { xmlMode: true });
      
      $patchDay('item').each((i, item) => {
        const $item = $patchDay(item);
        const title = $item.find('title').text().trim();
        const description = $item.find('description').text().trim();
        const link = $item.find('link').text().trim();
        const pubDate = new Date($item.find('pubDate').text().trim());
        
        if (pubDate < sevenDaysAgo) return;

        patches.push({
          title: `SAP Security Patch Day: ${title}`,
          date: pubDate.toISOString().split('T')[0],
          severity: 'HIGH', // Patch day announcements are typically high priority
          vendor: 'sap',
          component: 'Multiple Components',
          description: description.substring(0, 200) + '...',
          link
        });
      });

      if (patches.length === 0) {
        this.log('No new patches found in the last 7 days');
      } else {
        this.log(`Found ${patches.length} patches`);
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

  mapCVSSScore(score) {
    if (score >= 9.0) return 'CRITICAL';
    if (score >= 7.0) return 'HIGH';
    if (score >= 4.0) return 'MEDIUM';
    if (score > 0.0) return 'LOW';
    return 'UNKNOWN';
  }

  determineComponent(description) {
    const components = [
      'SAP NetWeaver',
      'SAP HANA',
      'SAP Business Suite',
      'SAP S/4HANA',
      'SAP ERP',
      'SAP CRM',
      'SAP SRM',
      'SAP SCM',
      'SAP BW',
      'SAP BusinessObjects',
      'SAP Solution Manager',
      'SAP Enterprise Portal',
      'SAP PI/PO',
      'SAP Mobile Platform',
      'SAP Cloud Platform',
      'SAP BTP',
      'SAP Fiori'
    ];
    
    const lowercaseDesc = description.toLowerCase();
    for (const component of components) {
      if (lowercaseDesc.includes(component.toLowerCase())) {
        return component;
      }
    }
    return 'SAP Products';
  }

  determineSeverity(description) {
    const lowercaseDesc = description.toLowerCase();
    if (lowercaseDesc.includes('hot news') || 
        lowercaseDesc.includes('critical') ||
        lowercaseDesc.includes('remote code execution')) {
      return 'CRITICAL';
    } else if (lowercaseDesc.includes('high priority') || 
               lowercaseDesc.includes('privilege escalation') ||
               lowercaseDesc.includes('authentication bypass')) {
      return 'HIGH';
    } else if (lowercaseDesc.includes('medium priority') || 
               lowercaseDesc.includes('denial of service') ||
               lowercaseDesc.includes('information disclosure')) {
      return 'MEDIUM';
    } else if (lowercaseDesc.includes('low priority')) {
      return 'LOW';
    }
    return 'UNKNOWN';
  }
}

// Execute if run directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const fetcher = new SAPPatchFetcher();
  fetcher.fetchPatches().catch(console.error);
}

export default SAPPatchFetcher;
