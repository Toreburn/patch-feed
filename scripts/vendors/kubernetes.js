import VendorPatchFetcher from '../vendor-fetch-template.js';
import { fileURLToPath } from 'url';

class KubernetesPatchFetcher extends VendorPatchFetcher {
  constructor() {
    super('kubernetes');
  }

  async fetchPatches() {
    try {
      this.log('Starting Kubernetes patch fetch via official CVE feed');

      const response = await this.fetchWithRetry(
        'https://kubernetes.io/docs/reference/issues-security/official-cve-feed/index.json'
      );

      const feed = response.data;
      const items = feed.items || [];
      const cutoff = this.getSevenDaysAgo();
      const patches = [];

      this.log(`Kubernetes CVE feed returned ${items.length} total items`);

      for (const item of items) {
        const pubDate = new Date(item.date_published || item.date_modified || '');
        if (isNaN(pubDate.getTime()) || pubDate < cutoff) continue;

        const title = item.title || '';
        const description = (item.content_text || item.summary || '').substring(0, 200);
        const link = item.url || item.external_url || '';
        const cves = this.extractCVEs(title + ' ' + (item.content_text || ''));

        patches.push({
          title,
          date: pubDate.toISOString().split('T')[0],
          severity: this.getSeverityFromText(title + ' ' + (item.content_text || '')),
          vendor: 'kubernetes',
          component: this.extractComponent(title + ' ' + (item.content_text || '')),
          description: description + (description.length >= 200 ? '...' : ''),
          link,
          cve: cves[0] || '',
          cves
        });
      }

      this.log(`Found ${patches.length} Kubernetes CVEs in lookback window`);
      return await this.updatePatchData(patches);
    } catch (error) {
      this.log(`Failed to fetch patches: ${error.message}`, 'ERROR');
      throw error;
    }
  }

  extractComponent(text) {
    const lower = text.toLowerCase();
    if (lower.includes('kubelet')) return 'kubelet';
    if (lower.includes('kube-apiserver') || lower.includes('api server')) return 'kube-apiserver';
    if (lower.includes('kube-proxy')) return 'kube-proxy';
    if (lower.includes('etcd')) return 'etcd';
    if (lower.includes('kubectl')) return 'kubectl';
    if (lower.includes('ingress')) return 'Ingress';
    if (lower.includes('csi')) return 'CSI';
    if (lower.includes('cni')) return 'CNI';
    return 'Kubernetes';
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const fetcher = new KubernetesPatchFetcher();
  fetcher.fetchPatches().catch(console.error);
}

export default KubernetesPatchFetcher;
