import VendorPatchFetcher from '../vendor-fetch-template.js';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { fileURLToPath } from 'url';

class CentOSPatchFetcher extends VendorPatchFetcher {
  constructor() {
    super('centos');
  }

  async fetchPatches() {
    try {
      // CentOS Security Announcements
      const response = await axios.get('https://lists.centos.org/pipermail/centos-announce/');
      const $ = cheerio.load(response.data);
      
      const patches = [];
      const sevenDaysAgo = this.getSevenDaysAgo();

      // Get the latest archive link
      const latestArchiveLink = $('a[href*=".txt.gz"]').first().attr('href');
      if (!latestArchiveLink) {
        throw new Error('No archive found');
      }

      // Fetch and parse the latest archive
      const archiveResponse = await axios.get(`https://lists.centos.org/pipermail/centos-announce/${latestArchiveLink}`, {
        responseType: 'text'
      });

      // Split the archive into individual messages
      const messages = archiveResponse.data.split(/^From /m);

      for (const message of messages) {
        // Parse message headers
        const dateMatch = message.match(/^Date: (.+)/m);
        const subjectMatch = message.match(/^Subject: (.+)/m);
        
        if (dateMatch && subjectMatch) {
          const pubDate = new Date(dateMatch[1]);
          const subject = subjectMatch[1];
          
          // Only process security announcements from the last 7 days
          if (pubDate >= sevenDaysAgo && subject.toLowerCase().includes('security')) {
            // Extract CVEs
            const cves = this.extractCVEs(message);
            
            // Extract severity
            const severity = this.extractSeverity(message);
            
            // Extract affected packages
            const packages = this.extractAffectedPackages(message);

            patches.push({
              title: subject,
              url: `https://lists.centos.org/pipermail/centos-announce/${latestArchiveLink}`,
              date: pubDate.toISOString(),
              description: this.extractDescription(message),
              severity,
              vendor: 'centos',
              cve: cves,
              affected_packages: packages,
              affected_versions: this.extractVersions(message)
            });
          }
        }
      }

      // Also check Red Hat's security data for CentOS-relevant updates
      const rhResponse = await axios.get('https://access.redhat.com/hydra/rest/securitydata/cve.json', {
        params: {
          per_page: 100,
          after: sevenDaysAgo.toISOString().split('T')[0]
        }
      });

      for (const cve of rhResponse.data) {
        // Only include if it affects RHEL (and thus CentOS)
        if (cve.affected_release?.some(r => r.product_name.includes('Red Hat Enterprise Linux'))) {
          patches.push({
            title: `CentOS Security Update for ${cve.bugzilla.description}`,
            url: cve.details,
            date: new Date(cve.public_date).toISOString(),
            description: cve.bugzilla.description,
            severity: this.mapSeverity(cve.severity),
            vendor: 'centos',
            cve: [cve.CVE],
            affected_packages: cve.affected_packages || [],
            affected_versions: cve.affected_release?.map(r => r.version) || []
          });
        }
      }

      return this.updatePatchData(patches);
    } catch (error) {
      this.log(`Error fetching patches: ${error.message}`, 'ERROR');
      throw error;
    }
  }

  extractDescription(message) {
    // Extract the body of the message (after headers)
    const bodyMatch = message.match(/\n\n([\s\S]+)$/);
    if (bodyMatch) {
      return bodyMatch[1]
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 1000); // Limit description length
    }
    return 'See announcement for details.';
  }

  extractCVEs(text) {
    const cveMatches = text.match(/CVE-\d{4}-\d{4,7}/g) || [];
    return [...new Set(cveMatches)];
  }

  extractSeverity(text) {
    const lower = text.toLowerCase();
    if (lower.includes('critical')) return 'Critical';
    if (lower.includes('important')) return 'High';
    if (lower.includes('moderate')) return 'Medium';
    if (lower.includes('low')) return 'Low';
    return 'Unknown';
  }

  extractAffectedPackages(text) {
    const packages = new Set();
    
    // Look for package names in format name-version-release
    const packageMatches = text.match(/[a-z0-9_-]+(?:-[0-9]+)+(?:\.[a-z0-9_]+)+/g) || [];
    for (const pkg of packageMatches) {
      // Extract just the package name (before first version number)
      const pkgName = pkg.match(/^[a-z0-9_-]+/);
      if (pkgName) {
        packages.add(pkgName[0]);
      }
    }

    return Array.from(packages);
  }

  extractVersions(text) {
    const versions = new Set();
    
    // Look for CentOS version numbers
    const versionMatches = text.match(/CentOS(?: Linux)? (\d+)(?: Stream)?/g) || [];
    for (const match of versionMatches) {
      const version = match.match(/\d+/);
      if (version) {
        versions.add(version[0]);
      }
    }

    return Array.from(versions);
  }

  mapSeverity(severity) {
    const severityMap = {
      'CRITICAL': 'Critical',
      'IMPORTANT': 'High',
      'MODERATE': 'Medium',
      'LOW': 'Low'
    };
    return severityMap[severity?.toUpperCase()] || 'Unknown';
  }
}

// Run the fetcher if this script is called directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const fetcher = new CentOSPatchFetcher();
  fetcher.fetchPatches().catch(console.error);
}

export default CentOSPatchFetcher;
