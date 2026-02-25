import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STALE_DAYS_WARN = 30;
const STALE_DAYS_ERROR = 60;
const CONSECUTIVE_EMPTY_WARN = 4;
const CONSECUTIVE_EMPTY_ERROR = 8;

function run() {
  const vendorsDir = path.join(__dirname, '../data/vendors');
  if (!fs.existsSync(vendorsDir)) {
    console.log('::error::No vendor data directory found');
    process.exit(1);
  }

  const files = fs.readdirSync(vendorsDir).filter(f => f.endsWith('.json'));
  const now = Date.now();

  const healthy = [];
  const warnings = [];
  const errors = [];

  for (const file of files) {
    const vendor = file.replace('.json', '');
    try {
      const data = JSON.parse(fs.readFileSync(path.join(vendorsDir, file), 'utf8'));
      const health = data.health || {};
      const patchCount = (data.patches || []).length;

      // Check 1: No health metadata at all (never ran with updated template)
      if (!health.lastFetchAttempt) {
        warnings.push({ vendor, reason: 'No health metadata — collector has not run with monitoring enabled', level: 'warn' });
        continue;
      }

      // Check 2: Consecutive empty fetches
      const emptyCount = health.consecutiveEmptyFetches || 0;
      if (emptyCount >= CONSECUTIVE_EMPTY_ERROR) {
        errors.push({ vendor, reason: `${emptyCount} consecutive empty fetches — collector is almost certainly broken`, level: 'error' });
      } else if (emptyCount >= CONSECUTIVE_EMPTY_WARN) {
        warnings.push({ vendor, reason: `${emptyCount} consecutive empty fetches — collector may be broken`, level: 'warn' });
      }

      // Check 3: Staleness — how long since we last got real data
      if (health.lastSuccessWithData) {
        const daysSince = (now - new Date(health.lastSuccessWithData).getTime()) / 86400000;
        if (daysSince > STALE_DAYS_ERROR) {
          errors.push({ vendor, reason: `No new patches in ${Math.round(daysSince)} days`, level: 'error' });
        } else if (daysSince > STALE_DAYS_WARN) {
          warnings.push({ vendor, reason: `No new patches in ${Math.round(daysSince)} days`, level: 'warn' });
        }
      } else if (patchCount === 0) {
        errors.push({ vendor, reason: 'Has never successfully fetched any patches', level: 'error' });
      }

      // Check 4: Last fetch had an error
      if (health.error) {
        errors.push({ vendor, reason: `Last fetch error: ${health.error}`, level: 'error' });
      }

      // If no issues, it's healthy
      if (!errors.find(e => e.vendor === vendor) && !warnings.find(w => w.vendor === vendor)) {
        healthy.push({ vendor, patches: patchCount, lastData: health.lastSuccessWithData });
      }
    } catch (err) {
      errors.push({ vendor, reason: `Failed to read data: ${err.message}`, level: 'error' });
    }
  }

  // Output results
  console.log('\n=== COLLECTOR HEALTH REPORT ===\n');

  if (healthy.length > 0) {
    console.log(`HEALTHY (${healthy.length}):`);
    for (const h of healthy) {
      console.log(`  ✅ ${h.vendor.padEnd(20)} ${String(h.patches).padStart(4)} patches`);
    }
  }

  if (warnings.length > 0) {
    console.log(`\nWARNINGS (${warnings.length}):`);
    for (const w of warnings) {
      console.log(`  ⚠️  ${w.vendor.padEnd(20)} ${w.reason}`);
      if (process.env.GITHUB_ACTIONS) {
        console.log(`::warning title=Collector Health: ${w.vendor}::${w.reason}`);
      }
    }
  }

  if (errors.length > 0) {
    console.log(`\nERRORS (${errors.length}):`);
    for (const e of errors) {
      console.log(`  ❌ ${e.vendor.padEnd(20)} ${e.reason}`);
      if (process.env.GITHUB_ACTIONS) {
        console.log(`::error title=Collector Health: ${e.vendor}::${e.reason}`);
      }
    }
  }

  // GitHub Actions Job Summary
  if (process.env.GITHUB_ACTIONS && process.env.GITHUB_STEP_SUMMARY) {
    const summary = [
      '## 🩺 Collector Health Report',
      '',
      `| Status | Count |`,
      `|--------|-------|`,
      `| ✅ Healthy | ${healthy.length} |`,
      `| ⚠️ Warning | ${warnings.length} |`,
      `| ❌ Error | ${errors.length} |`,
      ''
    ];

    if (errors.length > 0) {
      summary.push('### Errors', '');
      summary.push('| Vendor | Issue |', '|--------|-------|');
      for (const e of errors) {
        summary.push(`| ${e.vendor} | ${e.reason} |`);
      }
      summary.push('');
    }

    if (warnings.length > 0) {
      summary.push('### Warnings', '');
      summary.push('| Vendor | Issue |', '|--------|-------|');
      for (const w of warnings) {
        summary.push(`| ${w.vendor} | ${w.reason} |`);
      }
      summary.push('');
    }

    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary.join('\n'));
  }

  console.log(`\n=== SUMMARY: ${healthy.length} healthy, ${warnings.length} warnings, ${errors.length} errors ===`);

  // Exit with error code if there are critical failures
  // This lets the workflow decide whether to fail or just warn
  if (errors.length > 0) {
    process.exit(1);
  }
}

run();
