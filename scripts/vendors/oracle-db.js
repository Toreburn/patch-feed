import axios from 'axios';
import * as cheerio from 'cheerio';
import VendorPatchFetcher from '../vendor-fetch-template.js';
import { fileURLToPath } from 'url';
import zlib from 'zlib';
import { promisify } from 'util';

const gunzip = promisify(zlib.gunzip);

class OracleDBPatchFetcher extends VendorPatchFetcher {
  constructor() {
    super('oracle-db');
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
        const response = await axios.get(url, { 
          headers: this.headers,
          responseType: url.endsWith('.gz') ? 'arraybuffer' : 'json'
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
      this.log('Starting Oracle Database patch fetch');
      const patches = [];
      const sevenDaysAgo = this.getSevenDaysAgo();

      // Fetch from NVD's public CVE feed
      const nvdResponse = await this.fetchWithRetry('https://nvd.nist.gov/feeds/json/cve/1.1/nvdcve-1.1-recent.json.gz');
      const decompressed = await gunzip(nvdResponse.data);
      const cveData = JSON.parse(decompressed.toString());

      // Process each CVE
      for (const cve of cveData.CVE_Items) {
        const publishedDate = new Date(cve.publishedDate);
        if (publishedDate < sevenDaysAgo) continue;

        // Check if this CVE affects Oracle Database
        const description = cve.cve.description.description_data[0].value;
        const vendor = cve.cve.affects?.vendor?.vendor_data || [];
        
        // Look for Oracle Database in vendor and product data
        const isOracleDB = vendor.some(v => {
          if (!v.vendor_name.toLowerCase().includes('oracle')) return false;
          
          const products = v.product?.product_data || [];
          return products.some(p => {
            const productName = p.product_name.toLowerCase();
            return productName === 'database' ||
                   productName === 'rdbms' ||
                   productName === 'oracle database' ||
                   productName === 'database server' ||
                   productName.includes('oracle rdbms');
          });
        });

        // Only include if it's explicitly marked as affecting Oracle Database
        // or if both the description mentions Oracle Database and there's an Oracle advisory
        const references = cve.cve.references?.reference_data || [];
        const oracleRef = references.find(ref => 
          ref.url.includes('oracle.com/security-alerts/') ||
          ref.url.includes('oracle.com/technetwork/security-advisory/')
        );

        if (!isOracleDB && (!oracleRef || !this.isOracleDBRelated(description))) continue;

        patches.push({
          title: `Oracle Database Security Update: ${cve.cve.CVE_data_meta.ID}`,
          date: publishedDate.toISOString().split('T')[0],
          severity: this.mapCVSSSeverity(cve.impact?.baseMetricV3?.cvssV3?.baseSeverity),
          vendor: 'oracle-db',
          component: 'Oracle Database',
          description: description.substring(0, 200) + '...',
          link: oracleRef ? oracleRef.url : `https://nvd.nist.gov/vuln/detail/${cve.cve.CVE_data_meta.ID}`
        });
      }

      // Also fetch from Oracle's quarterly CPU feed
      const cpuResponse = await this.fetchWithRetry('https://www.oracle.com/security-alerts/cpujan2025.html');
      const $ = cheerio.load(cpuResponse.data);
      
      // Find the Database section in the CPU
      const dbSection = $('h3:contains("Oracle Database Server")').next('table');
      if (dbSection.length > 0) {
        const cpuDate = new Date('2025-01-16'); // January 2025 CPU release date
        if (cpuDate >= sevenDaysAgo) {
          dbSection.find('tr').each((i, row) => {
            const $row = $(row);
            const cells = $row.find('td');
            
            if (cells.length >= 4) {
              const cveId = $(cells[0]).text().trim();
              const component = $(cells[1]).text().trim();
              const subcomponent = $(cells[2]).text().trim();
              const cvss = $(cells[3]).text().trim();
              
              if (!cveId.startsWith('CVE-')) return;

              patches.push({
                title: `Oracle Database CPU Update: ${component} - ${subcomponent}`,
                date: cpuDate.toISOString().split('T')[0],
                severity: this.mapCVSSScore(parseFloat(cvss)),
                vendor: 'oracle-db',
                component: 'Oracle Database',
                description: `Security update for ${component} ${subcomponent} component. CVSS Base Score: ${cvss}`,
                link: 'https://www.oracle.com/security-alerts/cpujan2025.html'
              });
            }
          });
        }
      }

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
        this.log(`Response data: ${error.response.data.toString()}`, 'ERROR');
      }
      throw error;
    }
  }

  mapCVSSSeverity(severity) {
    const severityMap = {
      'CRITICAL': 'CRITICAL',
      'HIGH': 'HIGH',
      'MEDIUM': 'MEDIUM',
      'LOW': 'LOW'
    };
    return severityMap[severity] || 'UNKNOWN';
  }

  mapCVSSScore(score) {
    if (score >= 9.0) return 'CRITICAL';
    if (score >= 7.0) return 'HIGH';
    if (score >= 4.0) return 'MEDIUM';
    if (score > 0.0) return 'LOW';
    return 'UNKNOWN';
  }

  isOracleDBRelated(text) {
    const dbKeywords = [
      'oracle database', 'oracle rdbms', 'oracle db',
      'oracle database server', 'oracle server',
      'oracle tns', 'oracle listener',
      'oracle plsql', 'oracle pl/sql'
    ];
    
    const lowercaseText = text.toLowerCase();
    return dbKeywords.some(keyword => lowercaseText.includes(keyword.toLowerCase()));
  }

  isDatabaseRelated(text) {
    const dbKeywords = [
      'database', 'rdbms', 'sql', 'plsql', 'pl/sql',
      'tns', 'listener', 'data dictionary', 'tablespace'
    ];
    
    const lowercaseText = text.toLowerCase();
    return dbKeywords.some(keyword => lowercaseText.includes(keyword.toLowerCase()));
  }

  determineSeverity(description) {
    const lowercaseDesc = description.toLowerCase();
    if (lowercaseDesc.includes('critical') || 
        lowercaseDesc.includes('remote code execution') ||
        lowercaseDesc.includes('privilege elevation')) {
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
  const fetcher = new OracleDBPatchFetcher();
  fetcher.fetchPatches().catch(console.error);
}

export default OracleDBPatchFetcher;
