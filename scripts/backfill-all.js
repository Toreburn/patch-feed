import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const vendors = [
  'adobe', 'android', 'apple', 'aruba', 'atlassian', 'aws', 'azure',
  'checkpoint', 'chrome', 'cisco', 'citrix', 'cloudflare', 'crowdstrike',
  'debian', 'dell', 'docker', 'edge', 'f5', 'firefox',
  'fortinet', 'gcp', 'github', 'gitlab', 'hpe', 'ibm', 'ivanti',
  'jetbrains', 'juniper', 'kubernetes', 'lenovo',
  'microsoft', 'mssql', 'mysql', 'nodejs', 'oracle-db',
  'paloalto', 'postgresql', 'proxmox',
  'redhat', 'safari', 'salesforce', 'sap', 'servicenow', 'signal', 'slack',
  'sonicwall', 'sophos', 'suse', 'symantec', 'teams', 'trendmicro',
  'ubuntu', 'visualstudio', 'vmware', 'zoom', 'zscaler'
];

const results = [];

for (let i = 0; i < vendors.length; i++) {
  const vendor = vendors[i];
  const progress = `[${i + 1}/${vendors.length}]`;
  process.stdout.write(`${progress} ${vendor}...`);

  try {
    const mod = await import(`./vendors/${vendor}.js`);
    const Fetcher = mod.default;
    const fetcher = new Fetcher();
    await fetcher.fetchPatches();

    const dataFile = path.join(__dirname, `../data/vendors/${vendor}.json`);
    const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    const count = data.patches?.length || 0;

    process.stdout.write(` ${count} patches\n`);
    results.push({ vendor, status: 'OK', count });
  } catch (err) {
    process.stdout.write(` ERROR: ${err.message.substring(0, 60)}\n`);
    results.push({ vendor, status: 'ERROR', count: 0, error: err.message });
  }

  // Brief delay between vendors to be polite to upstream feeds
  if (i < vendors.length - 1) {
    await new Promise(r => setTimeout(r, 500));
  }
}

console.log('\n=== SUMMARY ===');
const ok = results.filter(r => r.status === 'OK');
const err = results.filter(r => r.status === 'ERROR');
const total = results.reduce((s, r) => s + r.count, 0);
console.log(`Working: ${ok.length}/${vendors.length}`);
console.log(`Total patches: ${total}`);
if (err.length) {
  console.log(`\nFailed:`);
  err.forEach(e => console.log(`  - ${e.vendor}: ${e.error.substring(0, 80)}`));
}
