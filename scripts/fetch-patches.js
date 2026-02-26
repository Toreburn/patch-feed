import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MAX_FETCH_LOGS = 50;

// Get the last week's date
const getLastWeekDate = () => {
    const date = new Date();
    date.setDate(date.getDate() - 7);
    return date;
};

async function fetchPatches() {
    const lastWeekDate = getLastWeekDate();
    const vendorsDir = path.join(__dirname, '../data/vendors');
    const outputFile = path.join(__dirname, '../data/patches.json');
    let allPatches = [];
    let allNewPatches = [];
    let logs = [];
    let newPatchCount = 0;

    try {
        // Create vendors directory if it doesn't exist
        if (!fs.existsSync(vendorsDir)) {
            fs.mkdirSync(vendorsDir, { recursive: true });
        }

        // Load previous patches.json to detect genuinely new patches
        let previousPatchKeys = new Set();
        if (fs.existsSync(outputFile)) {
            try {
                const prev = JSON.parse(fs.readFileSync(outputFile, 'utf8'));
                for (const p of (prev.patches || [])) {
                    previousPatchKeys.add(`${p.vendor}|${p.title}|${p.date}`);
                }
            } catch {}
        }

        // Read vendor files
        const vendorFiles = fs.readdirSync(vendorsDir);
        for (const file of vendorFiles) {
            if (file.endsWith('.json')) {
                try {
                    const vendorFilePath = path.join(vendorsDir, file);
                    const vendorData = JSON.parse(fs.readFileSync(vendorFilePath, 'utf8'));
                    const vendorName = vendorData.vendor || file.replace('.json', '');
                    const existingPatches = vendorData.patches || [];

                    // Filter patches from the last week
                    const recentPatches = existingPatches.filter(patch => {
                        const patchDate = new Date(patch.date);
                        return patchDate >= lastWeekDate;
                    });

                    allPatches.push(...recentPatches);

                    // Detect patches not present in the previous aggregation
                    const newPatches = recentPatches.filter(p =>
                        !previousPatchKeys.has(`${p.vendor}|${p.title}|${p.date}`)
                    );

                    if (newPatches.length > 0) {
                        newPatchCount += newPatches.length;
                        allNewPatches.push(...newPatches);
                        logs.push(`[SUCCESS] ${vendorName} - ${recentPatches.length} patches (${newPatches.length} new)`);
                    } else if (recentPatches.length > 0) {
                        logs.push(`[INFO] ${vendorName} - ${recentPatches.length} patches, no changes`);
                    }
                    // Skip vendors with zero recent patches to keep logs clean
                } catch (error) {
                    console.error(`Full error for ${file}:`, error);
                    const vendorName = file.replace('.json', '');
                    logs.push(`[ERROR] ${vendorName} - failed to read vendor data`);
                }
            }
        }

        // Sort all patches by date (newest first)
        allPatches.sort((a, b) => new Date(b.date) - new Date(a.date));

        // Read existing patches.json for fetchLogs history
        let existingData = { fetchLogs: [] };
        if (fs.existsSync(outputFile)) {
            try {
                existingData = JSON.parse(fs.readFileSync(outputFile, 'utf8'));
            } catch {}
        }

        // Create new log entry
        const logEntry = {
            timestamp: new Date().toISOString(),
            logs,
            newPatchCount,
            totalPatches: allPatches.length,
            vendors: Array.from(new Set(allPatches.map(patch => patch.vendor))),
            newPatches: allNewPatches.map(patch => ({
                vendor: patch.vendor,
                title: patch.title,
                date: patch.date,
                severity: patch.severity
            }))
        };

        // Add new log entry, cap history
        const fetchLogs = [logEntry, ...(existingData.fetchLogs || [])].slice(0, MAX_FETCH_LOGS);

        // Write combined patches and logs to file
        fs.writeFileSync(outputFile, JSON.stringify({
            lastUpdated: new Date().toISOString(),
            newPatches: newPatchCount,
            patches: allPatches,
            fetchLogs
        }, null, 2));

        console.log(`Aggregated ${allPatches.length} patches from ${logEntry.vendors.length} vendors (${newPatchCount} new)`);
    } catch (error) {
        console.error('Failed to fetch patches:', error);
        logs.push(`[ERROR] aggregation - failed to complete`);
    }

    return logs;
}

// Execute if run directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    fetchPatches().then(logs => {
        console.log(logs.join('\n'));
    }).catch(error => {
        console.error('Failed to fetch patches:', error);
    });
}

export default fetchPatches;
