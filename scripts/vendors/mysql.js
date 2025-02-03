import axios from 'axios';
import { load } from 'cheerio';
import VendorPatchFetcher from '../vendor-fetch-template.js';
import { fileURLToPath } from 'url';

class MySQLPatchFetcher extends VendorPatchFetcher {
  constructor() {
    super('mysql');
    this.headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      'Origin': 'https://www.oracle.com',
      'Referer': 'https://www.oracle.com/',
      'Connection': 'keep-alive'
    };
  }

  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async fetchWithRetry(url, maxRetries = 3) {
    for (let i = 0; i < maxRetries; i++) {
      try {
        const response = await axios.get(url, { 
          headers: this.headers,
          maxRedirects: 5,
          timeout: 10000,
          validateStatus: status => status < 400
        });
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
      this.log('Starting MySQL patch fetch');
      const patches = [];
      const sevenDaysAgo = this.getSevenDaysAgo();

      // Fetch from Oracle Critical Patch Updates
      const response = await this.fetchWithRetry('https://www.oracle.com/security-alerts/');
      const $ = load(response.data);
      
      // Process each security advisory
      $('.otm-content-article').each((i, article) => {
        const $article = $(article);
        const title = $article.find('h2, h3').first().text().trim();
        const content = $article.text();
        
        // Only process MySQL-related entries
        if (!title.toLowerCase().includes('mysql') && !content.toLowerCase().includes('mysql')) return;
        
        const dateMatch = content.match(/Released:\s+(\d{1,2}\s+\w+\s+\d{4})/i) || 
                         content.match(/(\w+\s+\d{1,2},\s+\d{4})/);
        if (!dateMatch) return;
        
        const releaseDate = new Date(dateMatch[1]);
        if (releaseDate < sevenDaysAgo) return;

        // Extract CVE IDs if available
        const cveMatches = content.match(/CVE-\d{4}-\d+/g) || [];

        // Create a patch entry for each CVE
        if (cveMatches.length > 0) {
          for (const cve of cveMatches) {
            patches.push({
              title: `MySQL Security Update: ${cve}`,
              date: releaseDate.toISOString().split('T')[0],
              severity: this.determineSeverity(content),
              vendor: 'mysql',
              component: this.determineComponent(content),
              description: this.extractDescription(content),
              link: `https://cve.mitre.org/cgi-bin/cvename.cgi?name=${cve}`
            });
          }
        } else {
          // Create a general patch entry if no specific CVEs found
          patches.push({
            title: `MySQL Security Update: ${title}`,
            date: releaseDate.toISOString().split('T')[0],
            severity: this.determineSeverity(content),
            vendor: 'mysql',
            component: this.determineComponent(content),
            description: this.extractDescription(content),
            link: 'https://www.oracle.com/security-alerts/'
          });
        }
      });

      // Also fetch from MySQL Release Notes
      const notesResponse = await this.fetchWithRetry('https://dev.mysql.com/doc/relnotes/mysql/8.0/en/');
      const $notes = load(notesResponse.data);
      
      $notes('.section').each((i, section) => {
        const $section = $notes(section);
        const title = $section.find('h2, h3').first().text().trim();
        const content = $section.text();
        
        // Only process security-related entries
        if (!this.isSecurityRelated(content)) return;
        
        const dateMatch = content.match(/Released:\s+(\d{1,2}\s+\w+\s+\d{4})/i) || 
                         content.match(/(\w+\s+\d{1,2},\s+\d{4})/);
        if (!dateMatch) return;
        
        const releaseDate = new Date(dateMatch[1]);
        if (releaseDate < sevenDaysAgo) return;

        // Extract CVE IDs if available
        const cveMatches = content.match(/CVE-\d{4}-\d+/g) || [];

        if (cveMatches.length > 0) {
          for (const cve of cveMatches) {
            patches.push({
              title: `MySQL Security Update: ${cve}`,
              date: releaseDate.toISOString().split('T')[0],
              severity: this.determineSeverity(content),
              vendor: 'mysql',
              component: this.determineComponent(content),
              description: this.extractDescription(content),
              link: `https://cve.mitre.org/cgi-bin/cvename.cgi?name=${cve}`
            });
          }
        } else {
          patches.push({
            title: `MySQL Security Update: ${title}`,
            date: releaseDate.toISOString().split('T')[0],
            severity: this.determineSeverity(content),
            vendor: 'mysql',
            component: this.determineComponent(content),
            description: this.extractDescription(content),
            link: 'https://dev.mysql.com/doc/relnotes/mysql/8.0/en/'
          });
        }
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

  determineComponent(text) {
    const components = {
      'innodb': 'InnoDB Storage Engine',
      'replication': 'Replication',
      'partitioning': 'Partitioning',
      'authentication': 'Authentication',
      'backup': 'Backup',
      'recovery': 'Recovery',
      'group replication': 'Group Replication',
      'x plugin': 'X Plugin',
      'enterprise encryption': 'Enterprise Encryption',
      'server': 'MySQL Server',
      'connector': 'MySQL Connector',
      'cluster': 'MySQL Cluster',
      'workbench': 'MySQL Workbench',
      'router': 'MySQL Router',
      'shell': 'MySQL Shell'
    };

    const lowercaseText = text.toLowerCase();
    for (const [key, value] of Object.entries(components)) {
      if (lowercaseText.includes(key)) {
        return value;
      }
    }
    return 'MySQL Database';
  }

  determineSeverity(description) {
    const severityMap = {
      'critical': 'CRITICAL',
      'high': 'HIGH',
      'important': 'HIGH',
      'medium': 'MEDIUM',
      'moderate': 'MEDIUM',
      'low': 'LOW'
    };

    const lowercaseDesc = description.toLowerCase();
    
    // First try to match exact severity words
    for (const [key, value] of Object.entries(severityMap)) {
      if (lowercaseDesc.includes(key)) {
        return value;
      }
    }

    // Then try to determine severity from description
    if (lowercaseDesc.includes('remote code execution') ||
        lowercaseDesc.includes('privilege elevation') ||
        lowercaseDesc.includes('unauthorized access')) {
      return 'CRITICAL';
    } else if (lowercaseDesc.includes('privilege escalation') ||
               lowercaseDesc.includes('sql injection')) {
      return 'HIGH';
    } else if (lowercaseDesc.includes('denial of service') ||
               lowercaseDesc.includes('information disclosure')) {
      return 'MEDIUM';
    }

    return 'UNKNOWN';
  }

  extractDescription(content) {
    // Try to find a security-related paragraph
    const paragraphs = content.split(/\n\n+/);
    for (const paragraph of paragraphs) {
      if (this.isSecurityRelated(paragraph)) {
        return paragraph.substring(0, 200) + '...';
      }
    }
    // If no security-related paragraph found, return first 200 chars
    return content.substring(0, 200) + '...';
  }

  isSecurityRelated(text) {
    const securityKeywords = [
      'security', 'vulnerability', 'exploit', 'attack',
      'CVE-', 'unauthorized', 'authentication', 'permission',
      'access control', 'injection', 'privilege', 'patch',
      'update', 'fix', 'advisory', 'remote code execution',
      'buffer overflow', 'sql injection', 'cross-site'
    ];
    
    const lowercaseText = text.toLowerCase();
    return securityKeywords.some(keyword => lowercaseText.includes(keyword.toLowerCase()));
  }
}

// Execute if run directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const fetcher = new MySQLPatchFetcher();
  fetcher.fetchPatches().catch(console.error);
}

export default MySQLPatchFetcher;
