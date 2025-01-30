// Function to load patch data and update logs
async function loadLogs() {
    try {
        const basePath = window.location.pathname.endsWith('/') ? window.location.pathname : window.location.pathname + '/';
        const path = basePath + 'data/patches.json';
        const response = await fetch(path);
        const data = await response.json();
        
        // Update fetch summary
        const fetchTimeEl = document.querySelector('.fetch-time');
        const fetchCountEl = document.querySelector('.fetch-count');
        const detailedLogsEl = document.querySelector('#detailed-logs');
        const lastFetched = new Date(data.lastFetched);
        
        fetchTimeEl.textContent = `Last fetch: ${lastFetched.toLocaleString()}`;
        fetchCountEl.textContent = `${data.fetchLog.successfulFetches.length}/${data.fetchLog.totalVendors} vendors fetched successfully`;
        
        // Group vendors by category
        const vendorCategories = {
            'Operating Systems & Core Infrastructure': [
                'microsoft', 'apple', 'redhat', 'ubuntu', 'suse', 'oracle-linux',
                'centos', 'vmware', 'citrix', 'proxmox'
            ],
            'Browsers & Communication': [
                'chrome', 'firefox', 'edge', 'safari', 'zoom', 'slack',
                'teams', 'webex', 'discord', 'signal'
            ],
            'Enterprise Software': [
                'oracle-db', 'sap', 'salesforce', 'mssql', 'postgresql', 'mysql',
                'mongodb', 'atlassian', 'servicenow', 'workday'
            ],
            'Security & Infrastructure': [
                'cisco', 'fortinet', 'paloalto', 'checkpoint', 'juniper', 'f5',
                'sonicwall', 'sophos', 'mcafee', 'symantec'
            ],
            'Development & Creative Tools': [
                'adobe', 'jetbrains', 'visualstudio', 'gitlab', 'github'
            ],
            'Cloud Services': [
                'aws', 'azure', 'gcp', 'ibm', 'oracle-cloud'
            ]
        };

        // Generate logs by category
        let logContent = '';
        for (const [category, vendors] of Object.entries(vendorCategories)) {
            logContent += `\n${category}\n${'='.repeat(category.length)}\n\n`;
            
            vendors.forEach(vendor => {
                const isSuccess = data.fetchLog.successfulFetches.includes(vendor);
                const status = isSuccess ? '✓' : '✗';
                const statusClass = isSuccess ? 'success' : 'failure';
                logContent += `<span class="${statusClass}">${status} ${vendor}</span>\n`;
            });
            
            logContent += '\n';
        }
        
        detailedLogsEl.innerHTML = logContent;
        
    } catch (error) {
        console.error('Error loading logs:', error);
        document.querySelector('.logs-container').innerHTML = '<div class="error">Error loading fetch logs. Please try again later.</div>';
    }
}

// Initialize logs
document.addEventListener('DOMContentLoaded', loadLogs);

// Auto-refresh every 5 minutes
setInterval(loadLogs, 5 * 60 * 1000);
