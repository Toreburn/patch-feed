import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Find vendors that have 0 patches and re-run them
const vendorDir = path.join(__dirname, '../data/vendors');
const allVendors = fs.readdirSync(vendorDir)
  .filter(f => f.endsWith('.json'))
  .map(f => f.replace('.json', ''));

const failed = [];
for (const vendor of allVendors) {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(vendorDir, `${vendor}.json`), 'utf8'));
    if (!data.patches || data.patches.length === 0) {
      failed.push(vendor);
    }
  } catch {
    failed.push(vendor);
  }
}

console.log(`Found ${failed.length} vendors with 0 patches: ${failed.join(', ')}\n`);

const results = [];
for (let i = 0; i < failed.length; i++) {
  const vendor = failed[i];
  const progress = `[${i + 1}/${failed.length}]`;
  process.stdout.write(`${progress} ${vendor}...`);

  try {
    const mod = await import(`./vendors/${vendor}.js`);
    const Fetcher = mod.default;
    const fetcher = new Fetcher();
    await fetcher.fetchPatches();

    const dataFile = path.join(vendorDir, `${vendor}.json`);
    const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    const count = data.patches?.length || 0;

    process.stdout.write(` ${count} patches\n`);
    results.push({ vendor, status: count > 0 ? 'OK' : 'EMPTY', count });
  } catch (err) {
    process.stdout.write(` ERROR: ${err.message.substring(0, 80)}\n`);
    results.push({ vendor, status: 'ERROR', count: 0, error: err.message });
  }

  // 2s delay between vendors
  if (i < failed.length - 1) {
    await new Promise(r => setTimeout(r, 2000));
  }
}

console.log('\n=== RETRY SUMMARY ===');
const ok = results.filter(r => r.status === 'OK');
const empty = results.filter(r => r.status === 'EMPTY');
const err = results.filter(r => r.status === 'ERROR');
console.log(`Success: ${ok.length}/${failed.length}`);
console.log(`Still empty: ${empty.length}`);
console.log(`Errors: ${err.length}`);
if (ok.length) {
  console.log(`\nFixed:`);
  ok.forEach(r => console.log(`  + ${r.vendor}: ${r.count} patches`));
}
if (empty.length) {
  console.log(`\nStill empty:`);
  empty.forEach(r => console.log(`  - ${r.vendor}`));
}
if (err.length) {
  console.log(`\nFailed:`);
  err.forEach(e => console.log(`  ! ${e.vendor}: ${e.error.substring(0, 80)}`));
}
