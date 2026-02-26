import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

        // Read vendor files
        const vendorFiles = fs.readdirSync(vendorsDir);
        for (const file of vendorFiles) {
            if (file.endsWith('.json')) {
                try {
                    const vendorFilePath = path.join(vendorsDir, file);
                    const vendorData = JSON.parse(fs.readFileSync(vendorFilePath, 'utf8'));
                    const existingPatches = vendorData.patches || [];
                    
                    // Filter patches from the last week
                    const recentPatches = existingPatches.filter(patch => {
                        const patchDate = new Date(patch.date);
                        return patchDate >= lastWeekDate;
                    });

                    // Add new patches that don't already exist
                    const newPatches = recentPatches.filter(newPatch => {
                        return !existingPatches.some(existing => 
                            existing.vendor === newPatch.vendor && 
                            existing.title === newPatch.title &&
                            existing.date === newPatch.date
                        );
                    });

                    if (newPatches.length > 0) {
                        // Update vendor file with new patches
                        const updatedPatches = [...existingPatches, ...newPatches];
                        updatedPatches.sort((a, b) => new Date(b.date) - new Date(a.date));

                        fs.writeFileSync(vendorFilePath, JSON.stringify({
                            vendor: vendorData.vendor,
                            lastUpdated: new Date().toISOString(),
                            patches: updatedPatches
                        }, null, 2));

                        newPatchCount += newPatches.length;
                        allPatches.push(...recentPatches);
                        allNewPatches.push(...newPatches);
                        logs.push(`[SUCCESS] Added ${newPatches.length} new patches to ${vendorData.vendor}`);
                    } else {
                        allPatches.push(...recentPatches);
                        logs.push(`[INFO] No new patches for ${vendorData.vendor} in the last week`);
                    }
                } catch (error) {
                    console.error(`Full error for ${file}:`, error);
                    logs.push(`[ERROR] ${file} - fetch failed`);
                }
            }
        }

        // Sort all patches by date (newest first)
        allPatches.sort((a, b) => new Date(b.date) - new Date(a.date));

        // Read existing patches.json if it exists
        let existingData = { fetchLogs: [] };
        if (fs.existsSync(outputFile)) {
            existingData = JSON.parse(fs.readFileSync(outputFile, 'utf8'));
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

        // Add new log entry to the beginning of the array
        existingData.fetchLogs = [logEntry, ...(existingData.fetchLogs || [])];

        // Write combined patches and logs to file
        fs.writeFileSync(outputFile, JSON.stringify({ 
            lastUpdated: new Date().toISOString(),
            newPatches: newPatchCount,
            patches: allPatches,
            fetchLogs: existingData.fetchLogs
        }, null, 2));

        logs.push(`[SUCCESS] Updated patches.json with ${allPatches.length} total patches (${newPatchCount} new)`);
    } catch (error) {
        console.error('Failed to fetch patches:', error);
        logs.push(`[ERROR] Patch aggregation failed`);
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
