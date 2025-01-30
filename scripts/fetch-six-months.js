import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Get date from 6 months ago
const getSixMonthsAgoDate = () => {
    const date = new Date();
    date.setMonth(date.getMonth() - 6);
    return date;
};

// Transform Microsoft API response to our format
function transformMicrosoftPatches(data) {
    // Example transformation based on Microsoft Security Update Guide API
    return data.value.map(update => ({
        title: update.name || update.id,
        date: update.releaseDate || new Date().toISOString(),
        severity: update.severity || 'Unknown',
        vendor: 'microsoft',
        component: update.product || 'Windows',
        description: update.description || 'No description available',
        link: `https://msrc.microsoft.com/update-guide/${update.id}`
    }));
}

// Fetch Microsoft patches for last 6 months
async function fetchMicrosoftPatches() {
    try {
        const response = await fetch('https://api.msrc.microsoft.com/sug/v2.0/en-US/vulnerabilities', {
            headers: {
                'Accept': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return transformMicrosoftPatches(data);
    } catch (error) {
        throw new Error(`Failed to fetch Microsoft patches: ${error.message}`);
    }
}

// Transform Red Hat API response to our format
function transformRedHatPatches(data) {
    return data.map(advisory => ({
        title: advisory.RHSA || advisory.name,
        date: advisory.public_date,
        severity: advisory.severity,
        vendor: 'redhat',
        component: advisory.product_names?.join(', ') || 'Unknown',
        description: advisory.description || 'No description available',
        link: `https://access.redhat.com/errata/${advisory.RHSA}`
    }));
}

// Fetch Red Hat patches for last 6 months
async function fetchRedHatPatches() {
    try {
        const response = await fetch('https://access.redhat.com/labs/securitydataapi/v1/oval/query', {
            headers: {
                'Accept': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        throw new Error(`Failed to fetch Red Hat patches: ${error.message}`);
    }
}

// Transform SUSE API response to our format
function transformSusePatches(data) {
    return data.map(advisory => ({
        title: advisory.name,
        date: advisory.updated,
        severity: advisory.severity,
        vendor: 'suse',
        component: advisory.affected_products?.join(', ') || 'Unknown',
        description: advisory.description || 'No description available',
        link: advisory.reference_url || `https://www.suse.com/security/cve/${advisory.cve}/`
    }));
}

// Fetch SUSE patches for last 6 months
async function fetchSusePatches() {
    try {
        const sixMonthsAgo = getSixMonthsAgoDate().toISOString().split('T')[0];
        const response = await fetch(`https://www.suse.com/support/update/filtered?product=&severity=&date_from=${sixMonthsAgo}`, {
            headers: {
                'Accept': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return transformSusePatches(data);
    } catch (error) {
        throw new Error(`Failed to fetch SUSE patches: ${error.message}`);
    }
}

// Save patches for a vendor
async function saveVendorPatches(vendor, patches) {
    const sixMonthsAgo = getSixMonthsAgoDate();
    const vendorsDir = path.join(__dirname, '../data/vendors');
    const vendorFile = path.join(vendorsDir, `${vendor}.json`);
    
    // Create vendors directory if it doesn't exist
    if (!fs.existsSync(vendorsDir)) {
        fs.mkdirSync(vendorsDir, { recursive: true });
    }

    // Filter patches from the last 6 months
    const recentPatches = patches.filter(patch => {
        const patchDate = new Date(patch.date);
        return patchDate >= sixMonthsAgo;
    });

    // Write to vendor file
    fs.writeFileSync(vendorFile, JSON.stringify({
        vendor,
        lastUpdated: new Date().toISOString(),
        patches: recentPatches
    }, null, 2));

    return recentPatches.length;
}

async function fetchSixMonthsPatches() {
    const logs = [];
    const vendors = ['microsoft', 'redhat', 'suse'];

    for (const vendor of vendors) {
        try {
            let patches;
            console.log(`Fetching patches for ${vendor}...`);
            
            switch (vendor) {
                case 'microsoft':
                    patches = await fetchMicrosoftPatches();
                    break;
                case 'redhat':
                    patches = await fetchRedHatPatches();
                    break;
                case 'suse':
                    patches = await fetchSusePatches();
                    break;
                default:
                    throw new Error(`Unknown vendor: ${vendor}`);
            }

            const patchCount = await saveVendorPatches(vendor, patches);
            logs.push(`[SUCCESS] Fetched and saved ${patchCount} patches for ${vendor}`);
            console.log(`Successfully processed ${patchCount} patches for ${vendor}`);
        } catch (error) {
            logs.push(`[ERROR] Failed to process ${vendor} patches: ${error.message}`);
            console.error(`Error processing ${vendor} patches:`, error.message);
        }
    }

    // Write logs
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const logFile = path.join(__dirname, '../logs', `fetch-six-months-${timestamp}.log`);
    fs.mkdirSync(path.join(__dirname, '../logs'), { recursive: true });
    fs.writeFileSync(logFile, logs.join('\n'));

    return logs;
}

// Execute if run directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    fetchSixMonthsPatches().then(logs => {
        console.log('\nComplete! Logs:');
        console.log(logs.join('\n'));
    }).catch(error => {
        console.error('Failed to fetch patches:', error);
        process.exit(1);
    });
}

export default fetchSixMonthsPatches;
