import axios from 'axios';
import * as cheerio from 'cheerio';
import VendorPatchFetcher from '../vendor-fetch-template.js';
import { fileURLToPath } from 'url';

class PaloAltoPatchFetcher extends VendorPatchFetcher {
  constructor() {
    super('paloalto');
  }

  async fetchPatches() {
    try {
      this.log('Starting Palo Alto Networks patch fetch');
      
      // Fetch from Palo Alto Security Advisories page
      const response = await axios.get('https://security.paloaltonetworks.com/');
      const $ = cheerio.load(response.data);
      
      const sevenDaysAgo = this.getSevenDaysAgo();
      const patches = [];

      // Process each security advisory
      $('.security-advisory').each((i, advisory) => {
        const $advisory = $(advisory);
        const title = $advisory.find('.advisory-title').text().trim();
        const dateText = $advisory.find('.advisory-date').text().trim();
        const description = $advisory.find('.advisory-description').text().trim();
        const severity = $advisory.find('.advisory-severity').text().trim();
        const advisoryId = $advisory.find('.advisory-id').text().trim();
        const affectedProducts = $advisory.find('.affected-products').text().trim();
        
        const releaseDate = new Date(dateText);
        if (releaseDate < sevenDaysAgo) return;

        patches.push({
          title: `Palo Alto Networks Security Advisory ${advisoryId}: ${title}`,
          date: releaseDate.toISOString().split('T')[0],
          severity: this.normalizeSeverity(severity),
          vendor: 'paloalto',
          component: this.determineComponent(affectedProducts),
          description: description.substring(0, 200) + '...',
          link: `https://security.paloaltonetworks.com/advisory/${advisoryId}`
        });
      });

      // Also fetch from Unit 42 Blog (Palo Alto's Threat Research Team)
      const blogResponse = await axios.get('https://unit42.paloaltonetworks.com/');
      const $blog = cheerio.load(blogResponse.data);
      
      $blog('article').each((i, article) => {
        const $article = $(article);
        const title = $article.find('.blog-title').text().trim();
        const dateText = $article.find('.blog-date').text().trim();
        const content = $article.find('.blog-content').text().trim();
        
        const releaseDate = new Date(dateText);
        if (releaseDate < sevenDaysAgo) return;

        // Only include security update posts
        if (this.isSecurityRelated(title + ' ' + content)) {
          patches.push({
            title: `Palo Alto Networks Security Update: ${title}`,
            date: releaseDate.toISOString().split('T')[0],
            severity: this.determineSeverity(content),
            vendor: 'paloalto',
            component: this.determineComponent(content),
            description: content.substring(0, 200) + '...',
            link: $article.find('.blog-title a').attr('href')
          });
        }
      });

      if (patches.length === 0) {
        this.log('No new patches found in the last 7 days');
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

  normalizeSeverity(severity) {
    const severityMap = {
      'Critical': 'CRITICAL',
      'High': 'HIGH',
      'Medium': 'MEDIUM',
      'Low': 'LOW',
      'Moderate': 'MEDIUM'
    };
    return severityMap[severity] || 'UNKNOWN';
  }

  determineComponent(text) {
    const components = [
      'PAN-OS',
      'Panorama',
      'GlobalProtect',
      'Prisma Cloud',
      'Prisma Access',
      'Prisma SD-WAN',
      'Cortex XDR',
      'Cortex XSOAR',
      'Cortex Data Lake',
      'VM-Series',
      'WildFire',
      'AutoFocus',
      'IoT Security'
    ];
    
    const lowercaseText = text.toLowerCase();
    for (const component of components) {
      if (lowercaseText.includes(component.toLowerCase())) {
        return component;
      }
    }
    return 'Palo Alto Networks Products';
  }

  isSecurityRelated(text) {
    const securityKeywords = [
      'security', 'vulnerability', 'exploit', 'attack',
      'CVE-', 'unauthorized', 'authentication', 'permission',
      'access control', 'injection', 'privilege', 'patch',
      'update', 'fix', 'advisory', 'threat', 'malware',
      'ransomware', 'firewall', 'IPS', 'zero-day'
    ];
    
    const lowercaseText = text.toLowerCase();
    return securityKeywords.some(keyword => lowercaseText.includes(keyword.toLowerCase()));
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
               lowercaseDesc.includes('moderate') ||
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
  const fetcher = new PaloAltoPatchFetcher();
  fetcher.fetchPatches().catch(console.error);
}

export default PaloAltoPatchFetcher;
