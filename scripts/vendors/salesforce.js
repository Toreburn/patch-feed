import axios from 'axios';
import * as cheerio from 'cheerio';
import VendorPatchFetcher from '../vendor-fetch-template.js';
import { fileURLToPath } from 'url';

class SalesforcePatchFetcher extends VendorPatchFetcher {
  constructor() {
    super('salesforce');
    this.headers = {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      'Accept': 'application/json, text/plain, */*',
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
      this.log('Starting Salesforce patch fetch');
      const patches = [];
      const sevenDaysAgo = this.getSevenDaysAgo();

      // Fetch from Salesforce Trust Security Advisories
      const response = await this.fetchWithRetry('https://trust.salesforce.com/security/advisories/feed');
      const $ = cheerio.load(response.data);
      
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
          title: `Salesforce Security Advisory: ${title}`,
          date: pubDate.toISOString().split('T')[0],
          severity: cvssScore ? this.mapCVSSScore(cvssScore) : this.determineSeverity(description),
          vendor: 'salesforce',
          component: this.determineComponent(description),
          description: description.substring(0, 200) + '...',
          link
        });
      });

      // Also fetch from Salesforce Trust Security Updates
      const updatesResponse = await this.fetchWithRetry('https://trust.salesforce.com/security/updates/feed');
      const $updates = cheerio.load(updatesResponse.data);
      
      $updates('item').each((i, item) => {
        const $item = $updates(item);
        const title = $item.find('title').text().trim();
        const description = $item.find('description').text().trim();
        const link = $item.find('link').text().trim();
        const pubDate = new Date($item.find('pubDate').text().trim());
        
        if (pubDate < sevenDaysAgo) return;

        patches.push({
          title: `Salesforce Security Update: ${title}`,
          date: pubDate.toISOString().split('T')[0],
          severity: this.determineSeverity(description),
          vendor: 'salesforce',
          component: this.determineComponent(description),
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

  determineComponent(text) {
    const components = [
      'Sales Cloud',
      'Service Cloud',
      'Marketing Cloud',
      'Commerce Cloud',
      'Platform',
      'Analytics Cloud',
      'Experience Cloud',
      'Heroku',
      'MuleSoft',
      'Tableau',
      'Slack',
      'Field Service',
      'Einstein',
      'AppExchange',
      'Salesforce Mobile',
      'Salesforce CPQ',
      'Pardot',
      'Quip',
      'Work.com',
      'Industries Cloud'
    ];
    
    const lowercaseText = text.toLowerCase();
    for (const component of components) {
      if (lowercaseText.includes(component.toLowerCase())) {
        return component;
      }
    }
    return 'Salesforce Products';
  }

  determineSeverity(description) {
    const lowercaseDesc = description.toLowerCase();
    if (lowercaseDesc.includes('critical') || 
        lowercaseDesc.includes('remote code execution') ||
        lowercaseDesc.includes('authentication bypass')) {
      return 'CRITICAL';
    } else if (lowercaseDesc.includes('high') || 
               lowercaseDesc.includes('privilege escalation') ||
               lowercaseDesc.includes('unauthorized access')) {
      return 'HIGH';
    } else if (lowercaseDesc.includes('medium') || 
               lowercaseDesc.includes('denial of service') ||
               lowercaseDesc.includes('information disclosure')) {
      return 'MEDIUM';
    } else if (lowercaseDesc.includes('low')) {
      return 'LOW';
    }
    return 'UNKNOWN';
  }
}

// Execute if run directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const fetcher = new SalesforcePatchFetcher();
  fetcher.fetchPatches().catch(console.error);
}

export default SalesforcePatchFetcher;
