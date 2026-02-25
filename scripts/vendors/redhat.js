import VendorPatchFetcher from '../vendor-fetch-template.js';
import { fileURLToPath } from 'url';

class RedHatPatchFetcher extends VendorPatchFetcher {
  constructor() {
    super('redhat');
  }

  async fetchPatches() {
    try {
      this.log('Starting Red Hat patch fetch via Security Data API');

      const cutoff = this.getSevenDaysAgo();
      const afterDate = cutoff.toISOString().split('T')[0];

      const response = await this.fetchWithRetry(
        `https://access.redhat.com/hydra/rest/securitydata/cve.json?after=${afterDate}`,
        { headers: { 'Accept': 'application/json' }, timeout: 30000 }
      );

      const cves = response.data || [];
      this.log(`Red Hat API returned ${cves.length} CVEs since ${afterDate}`);

      const patches = cves.map(cve => ({
        title: `${cve.CVE}: ${(cve.bugzilla_description || cve.CVE).substring(0, 120)}`,
        date: (cve.public_date || '').split('T')[0],
        severity: this.mapSeverity(cve.severity),
        vendor: 'redhat',
        component: this.extractComponent(cve.bugzilla_description || ''),
        description: (cve.bugzilla_description || '').substring(0, 200) +
          ((cve.bugzilla_description || '').length > 200 ? '...' : ''),
        link: cve.resource_url || `https://access.redhat.com/security/cve/${cve.CVE}`,
        cve: cve.CVE,
        cvss: cve.cvss3_score ? parseFloat(cve.cvss3_score) : null
      }));

      this.log(`Processed ${patches.length} Red Hat CVEs`);
      return await this.updatePatchData(patches);
    } catch (error) {
      this.log(`Failed to fetch patches: ${error.message}`, 'ERROR');
      throw error;
    }
  }

  mapSeverity(sev) {
    if (!sev) return 'UNKNOWN';
    const s = sev.toLowerCase();
    if (s === 'critical') return 'CRITICAL';
    if (s === 'important') return 'HIGH';
    if (s === 'moderate') return 'MEDIUM';
    if (s === 'low') return 'LOW';
    return 'UNKNOWN';
  }

  extractComponent(desc) {
    const lower = desc.toLowerCase();
    if (lower.includes('ansible')) return 'Ansible';
    if (lower.includes('openshift')) return 'OpenShift';
    if (lower.includes('satellite')) return 'Satellite';
    if (lower.includes('jboss')) return 'JBoss';
    if (lower.includes('ceph')) return 'Ceph Storage';
    if (lower.includes('virtualization')) return 'Virtualization';
    if (lower.includes('kernel')) return 'Kernel';
    if (lower.includes('podman') || lower.includes('container')) return 'Containers';
    return 'Red Hat Enterprise Linux';
  }
}

export default RedHatPatchFetcher;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const fetcher = new RedHatPatchFetcher();
  fetcher.fetchPatches().catch(console.error);
}
