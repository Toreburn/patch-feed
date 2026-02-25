import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

async function testVendor(vendor) {
  try {
    const module = await import(`./vendors/${vendor}.js`);
    const Fetcher = module.default;
    const fetcher = new Fetcher();

    // Temporarily override log to capture output
    const logs = [];
    fetcher.log = (msg, level = 'INFO') => logs.push({ level, msg });

    await fetcher.fetchPatches();

    // Read the vendor data file to get results
    const dataFile = path.join(__dirname, `../data/vendors/${vendor}.json`);
    let total = 0;
    let recent = 0;

    if (fs.existsSync(dataFile)) {
      const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
      total = data.patches?.length || 0;

      // Count patches from last 7 days
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      recent = (data.patches || []).filter(p => new Date(p.date) >= sevenDaysAgo).length;
    }

    return { vendor, status: 'OK', total, recent, error: null };
  } catch (error) {
    return { vendor, status: 'ERROR', total: 0, recent: 0, error: error.message };
  }
}

async function main() {
  console.log('Testing all vendor fetchers...\n');
  console.log('Vendor'.padEnd(20) + 'Status'.padEnd(10) + 'Recent'.padEnd(10) + 'Total'.padEnd(10) + 'Notes');
  console.log('-'.repeat(80));

  const results = [];

  for (const vendor of vendors) {
    process.stdout.write(`Testing ${vendor}...`);
    const result = await testVendor(vendor);
    results.push(result);

    // Clear the line
    process.stdout.write('\r' + ' '.repeat(40) + '\r');

    const status = result.status === 'OK'
      ? (result.recent > 0 ? '✅ OK' : '⚠️ OK')
      : '❌ ERR';
    const notes = result.error ? result.error.substring(0, 30) : '';

    console.log(
      result.vendor.padEnd(20) +
      status.padEnd(10) +
      String(result.recent).padEnd(10) +
      String(result.total).padEnd(10) +
      notes
    );
  }

  // Summary
  console.log('\n' + '='.repeat(80));
  const working = results.filter(r => r.status === 'OK');
  const withData = results.filter(r => r.recent > 0);
  const errors = results.filter(r => r.status === 'ERROR');

  console.log(`\nSummary:`);
  console.log(`  Working vendors: ${working.length}/${vendors.length}`);
  console.log(`  With recent patches (7 days): ${withData.length}`);
  console.log(`  With errors: ${errors.length}`);

  if (errors.length > 0) {
    console.log(`\nFailed vendors:`);
    errors.forEach(e => console.log(`  - ${e.vendor}: ${e.error}`));
  }

  const totalRecent = results.reduce((sum, r) => sum + r.recent, 0);
  console.log(`\nTotal recent patches across all vendors: ${totalRecent}`);
}

main().catch(console.error);
