#!/usr/bin/env node
/**
 * Fetch patches from all vendors with a 365-day lookback period.
 * This is used to build out the initial data repository.
 *
 * Usage: node scripts/fetch-all-365.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Set 365-day lookback
process.env.LOOKBACK_DAYS = '365';

const vendors = [
  'adobe', 'apple', 'atlassian', 'aws', 'azure', 'checkpoint',
  'chrome', 'cisco', 'citrix', 'edge', 'firefox',
  'fortinet', 'gcp', 'gitlab', 'ibm', 'jetbrains', 'juniper',
  'microsoft', 'mssql', 'oracle-db', 'paloalto', 'postgresql', 'proxmox',
  'redhat', 'safari', 'salesforce', 'signal',
  'sonicwall', 'sophos', 'suse', 'symantec',
  'ubuntu', 'visualstudio', 'vmware', 'zoom'
];

async function runVendor(vendor) {
  try {
    const module = await import(`./vendors/${vendor}.js`);
    const FetcherClass = module.default;
    const fetcher = new FetcherClass();
    await fetcher.fetchPatches();
    return { vendor, status: 'success' };
  } catch (error) {
    console.error(`[ERROR] ${vendor}: ${error.message}`);
    return { vendor, status: 'failed', error: error.message };
  }
}

async function main() {
  console.log('='.repeat(80));
  console.log('Fetching patches for all vendors with 365-day lookback');
  console.log('='.repeat(80));
  console.log('');

  const results = [];
  const startTime = Date.now();

  // Run vendors sequentially to avoid rate limiting
  for (let i = 0; i < vendors.length; i++) {
    const vendor = vendors[i];
    console.log(`\n[${i + 1}/${vendors.length}] Fetching ${vendor}...`);

    const result = await runVendor(vendor);
    results.push(result);

    // Brief delay between vendors to be polite to upstream feeds
    if (i < vendors.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  const endTime = Date.now();
  const duration = ((endTime - startTime) / 1000 / 60).toFixed(1);

  console.log('\n' + '='.repeat(80));
  console.log('Summary');
  console.log('='.repeat(80));

  const successful = results.filter(r => r.status === 'success');
  const failed = results.filter(r => r.status === 'failed');

  console.log(`\nSuccessful: ${successful.length}/${vendors.length}`);
  console.log(`Failed: ${failed.length}/${vendors.length}`);
  console.log(`Duration: ${duration} minutes`);

  if (failed.length > 0) {
    console.log('\nFailed vendors:');
    failed.forEach(r => console.log(`  - ${r.vendor}: ${r.error}`));
  }

  // Update patches.json with all vendor data
  console.log('\nUpdating patches.json...');

  const vendorsDir = path.join(__dirname, '../data/vendors');
  const outputFile = path.join(__dirname, '../data/patches.json');

  let allPatches = [];
  const vendorStats = [];

  for (const vendor of vendors) {
    try {
      const vendorFile = path.join(vendorsDir, `${vendor}.json`);
      if (fs.existsSync(vendorFile)) {
        const data = JSON.parse(fs.readFileSync(vendorFile, 'utf8'));
        if (data.patches && data.patches.length > 0) {
          allPatches.push(...data.patches);
          vendorStats.push({ vendor, count: data.patches.length });
        }
      }
    } catch (error) {
      console.error(`Error reading ${vendor}.json:`, error.message);
    }
  }

  // Sort all patches by date (newest first)
  allPatches.sort((a, b) => new Date(b.date) - new Date(a.date));

  // Read existing patches.json for fetch logs
  let existingData = { fetchLogs: [] };
  if (fs.existsSync(outputFile)) {
    try {
      existingData = JSON.parse(fs.readFileSync(outputFile, 'utf8'));
    } catch (error) {
      // Start fresh if file is corrupted
    }
  }

  // Create new log entry
  const logEntry = {
    timestamp: new Date().toISOString(),
    logs: results.map(r => r.status === 'success'
      ? `[SUCCESS] ${r.vendor} - fetched successfully`
      : `[ERROR] ${r.vendor} - ${r.error}`
    ),
    newPatchCount: allPatches.length,
    totalPatches: allPatches.length,
    vendors: vendors,
    lookbackDays: 365
  };

  // Write combined data
  fs.writeFileSync(outputFile, JSON.stringify({
    lastUpdated: new Date().toISOString(),
    newPatches: allPatches.length,
    totalPatches: allPatches.length,
    patches: allPatches,
    fetchLogs: [logEntry, ...(existingData.fetchLogs || []).slice(0, 9)]
  }, null, 2));

  console.log(`\nTotal patches collected: ${allPatches.length}`);
  console.log('\nTop vendors by patch count:');
  vendorStats.sort((a, b) => b.count - a.count);
  vendorStats.slice(0, 10).forEach(v => console.log(`  ${v.vendor}: ${v.count}`));

  console.log('\nDone!');
}

main().catch(console.error);
