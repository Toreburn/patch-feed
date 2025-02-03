import axios from 'axios';
import * as cheerio from 'cheerio';
import VendorPatchFetcher from '../vendor-fetch-template.js';
import { fileURLToPath } from 'url';

class MSSQLPatchFetcher extends VendorPatchFetcher {
  constructor() {
    super('mssql');
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
      this.log('Starting Microsoft SQL Server patch fetch');
      const patches = [];
      const sevenDaysAgo = this.getSevenDaysAgo();

      // Fetch from Microsoft Security Update Guide RSS feed
      const response = await this.fetchWithRetry('https://api.msrc.microsoft.com/update-guide/rss');
      const $ = cheerio.load(response.data, { xmlMode: true });
      
      // Process each security update
      $('item').each((i, item) => {
        const $item = $(item);
        const title = $item.find('title').text().trim();
        const description = $item.find('description').text().trim();
        const link = $item.find('link').text().trim();
        const pubDate = new Date($item.find('pubDate').text().trim());
        
        if (pubDate < sevenDaysAgo) return;

        // Only include SQL Server related updates
        if (!this.isSQLServerRelated(title + ' ' + description)) return;

        // Extract CVE ID if available
        const cveMatch = title.match(/CVE-\d{4}-\d+/) || description.match(/CVE-\d{4}-\d+/);
        const cveId = cveMatch ? cveMatch[0] : null;

        // Extract KB number if available
        const kbMatch = description.match(/KB(\d+)/) || title.match(/KB(\d+)/);
        const kbNumber = kbMatch ? kbMatch[1] : null;

        patches.push({
          title: `SQL Server Security Update: ${title}`,
          date: pubDate.toISOString().split('T')[0],
          severity: this.determineSeverity(description),
          vendor: 'mssql',
          component: this.determineComponent(description),
          description: description.substring(0, 200) + '...',
          link: cveId ? 
            `https://msrc.microsoft.com/update-guide/vulnerability/${cveId}` :
            kbNumber ? 
              `https://support.microsoft.com/help/${kbNumber}` :
              link
        });
      });

      // Also fetch from SQL Server Updates page
      const updatesResponse = await this.fetchWithRetry('https://learn.microsoft.com/en-us/sql/database-engine/install-windows/latest-updates-for-microsoft-sql-server');
      const $updates = cheerio.load(updatesResponse.data);
      
      $updates('article').find('h2, h3').each((i, heading) => {
        const $section = $(heading);
        const title = $section.text().trim();
        const content = $section.nextUntil('h2, h3').text();
        
        if (!this.isSecurityRelated(content)) return;

        const dateMatch = content.match(/Released:?\s+(\w+ \d+,\s+\d{4})/i);
        if (!dateMatch) return;
        
        const releaseDate = new Date(dateMatch[1]);
        if (releaseDate < sevenDaysAgo) return;

        // Extract KB number if available
        const kbMatch = content.match(/KB(\d+)/) || title.match(/KB(\d+)/);
        const kbNumber = kbMatch ? kbMatch[1] : null;

        patches.push({
          title: `SQL Server Update: ${title}`,
          date: releaseDate.toISOString().split('T')[0],
          severity: this.determineSeverity(content),
          vendor: 'mssql',
          component: this.determineComponent(content),
          description: content.substring(0, 200) + '...',
          link: kbNumber ? 
            `https://support.microsoft.com/help/${kbNumber}` :
            'https://learn.microsoft.com/en-us/sql/database-engine/install-windows/latest-updates-for-microsoft-sql-server'
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

  isSQLServerRelated(text) {
    const sqlKeywords = [
      'sql server', 'mssql', 'sqlservr', 'sql database',
      'transact-sql', 't-sql', 'reporting services',
      'analysis services', 'integration services'
    ];
    
    const lowercaseText = text.toLowerCase();
    return sqlKeywords.some(keyword => lowercaseText.includes(keyword.toLowerCase()));
  }

  isSecurityRelated(text) {
    const securityKeywords = [
      'security', 'vulnerability', 'exploit', 'attack',
      'CVE-', 'unauthorized', 'authentication', 'permission',
      'access control', 'injection', 'privilege', 'patch',
      'update', 'fix', 'advisory'
    ];
    
    const lowercaseText = text.toLowerCase();
    return securityKeywords.some(keyword => lowercaseText.includes(keyword.toLowerCase()));
  }

  determineComponent(text) {
    const components = {
      'reporting services': 'SQL Server Reporting Services',
      'analysis services': 'SQL Server Analysis Services',
      'integration services': 'SQL Server Integration Services',
      'database engine': 'SQL Server Database Engine',
      'replication': 'SQL Server Replication',
      'full-text search': 'SQL Server Full-Text Search'
    };

    const lowercaseText = text.toLowerCase();
    for (const [key, value] of Object.entries(components)) {
      if (lowercaseText.includes(key)) {
        return value;
      }
    }
    return 'Microsoft SQL Server';
  }

  determineSeverity(description) {
    const lowercaseDesc = description.toLowerCase();
    if (lowercaseDesc.includes('critical') || 
        lowercaseDesc.includes('remote code execution') ||
        lowercaseDesc.includes('privilege elevation')) {
      return 'CRITICAL';
    } else if (lowercaseDesc.includes('important') || 
               lowercaseDesc.includes('privilege escalation') ||
               lowercaseDesc.includes('unauthorized access')) {
      return 'HIGH';
    } else if (lowercaseDesc.includes('moderate') || 
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
  const fetcher = new MSSQLPatchFetcher();
  fetcher.fetchPatches().catch(console.error);
}

export default MSSQLPatchFetcher;
