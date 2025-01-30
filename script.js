document.addEventListener('DOMContentLoaded', () => {
    const patchFeed = document.getElementById('patch-feed');
    const vendorCheckboxes = document.querySelectorAll('input[name="vendor"]');
    const severityCheckboxes = document.querySelectorAll('input[name="severity"]');
    const startDate = document.getElementById('start-date');
    const endDate = document.getElementById('end-date');
    const toggleButton = document.getElementById('toggle-all');
    const fetchStatus = document.querySelector('.fetch-status');

    // All vendors have data available
    const availableVendors = [
        'microsoft', 'apple', 'redhat', 'ubuntu', 'suse', 'oracle-linux', 'centos', 'vmware', 'citrix', 'proxmox',
        'chrome', 'firefox', 'edge', 'safari', 'zoom', 'slack', 'teams', 'webex', 'discord', 'signal',
        'oracle-db', 'sap', 'salesforce', 'mssql', 'postgresql', 'mysql', 'mongodb', 'atlassian', 'servicenow', 'workday',
        'cisco', 'fortinet', 'paloalto', 'checkpoint', 'juniper', 'f5', 'sonicwall', 'sophos', 'mcafee', 'symantec',
        'adobe', 'jetbrains', 'visualstudio', 'gitlab', 'github', 'aws', 'azure', 'gcp', 'ibm', 'oracle-cloud'
    ];

    let patches = [];
    let fetchLogs = [];
    let currentFilters = {
        vendors: new Set(),
        severities: new Set(Array.from(severityCheckboxes).map(cb => cb.value)),
        startDate: null,
        endDate: null
    };

    // Set default date range (today to 30 days ago)
    const today = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(today.getDate() - 30);
    
    startDate.valueAsDate = thirtyDaysAgo;
    endDate.valueAsDate = today;
    currentFilters.startDate = thirtyDaysAgo;
    currentFilters.endDate = today;

    // Setup vendor checkboxes
    vendorCheckboxes.forEach(checkbox => {
        const label = checkbox.parentElement;
        
        if (!availableVendors.includes(checkbox.value)) {
            checkbox.disabled = true;
            label.classList.add('disabled');
            label.title = 'Data not available';
        } else {
            // Check all available vendors by default
            checkbox.checked = true;
            currentFilters.vendors.add(checkbox.value);
        }

        checkbox.addEventListener('change', () => {
            if (!checkbox.disabled) {
                if (checkbox.checked) {
                    currentFilters.vendors.add(checkbox.value);
                } else {
                    currentFilters.vendors.delete(checkbox.value);
                }
                loadAndDisplayPatches();
            }
        });
    });

    // Set toggle button to "Uncheck All" since all are checked
    toggleButton.textContent = 'Uncheck All';

    // Toggle all vendors
    toggleButton.addEventListener('click', () => {
        const isChecking = toggleButton.textContent === 'Check All';
        vendorCheckboxes.forEach(cb => {
            if (!cb.disabled) {
                cb.checked = isChecking;
                if (isChecking) {
                    currentFilters.vendors.add(cb.value);
                }
            }
        });
        toggleButton.textContent = isChecking ? 'Uncheck All' : 'Check All';
        if (!isChecking) {
            currentFilters.vendors.clear();
        }
        loadAndDisplayPatches();
    });

    // Event listeners for severity filters
    severityCheckboxes.forEach(checkbox => {
        checkbox.addEventListener('change', () => {
            if (checkbox.checked) {
                currentFilters.severities.add(checkbox.value);
            } else {
                currentFilters.severities.delete(checkbox.value);
            }
            applyFilters();
        });
    });

    // Event listeners for date filters
    startDate.addEventListener('change', () => {
        currentFilters.startDate = startDate.value ? new Date(startDate.value) : null;
        applyFilters();
    });

    endDate.addEventListener('change', () => {
        currentFilters.endDate = endDate.value ? new Date(endDate.value) : null;
        applyFilters();
    });

    async function loadPatchesJson() {
        try {
            const response = await fetch('data/patches.json');
            if (response.ok) {
                const data = await response.json();
                return data;
            }
        } catch (error) {
            console.error('Failed to load patches.json:', error);
        }
        return null;
    }

    function updateFetchStatus(timestamp, patchCount, newPatchCount) {
        fetchStatus.innerHTML = `
            <span class="fetch-time">Last Updated: ${timestamp.toLocaleString()}</span>
            <span class="fetch-count">${patchCount} total patches</span>
            ${newPatchCount > 0 ? `<span class="fetch-count new-patches">${newPatchCount} new patches</span>` : ''}
            <a href="#" class="log-link" id="view-logs">View Fetch Logs</a>
        `;

        // Reattach event listener to the new view logs link
        document.getElementById('view-logs').addEventListener('click', (e) => {
            e.preventDefault();
            displayFetchLogs();
        });
    }

    async function loadAndDisplayPatches() {
        if (currentFilters.vendors.size === 0) {
            patchFeed.innerHTML = '<div class="no-results">Select vendors to view patches</div>';
            fetchStatus.innerHTML = '';
            return;
        }

        patchFeed.innerHTML = '<div class="loading">Loading patches...</div>';
        patches = [];
        let newPatchCount = 0;

        try {
            // Load patches.json to get new patch count
            const patchesData = await loadPatchesJson();
            if (patchesData) {
                newPatchCount = patchesData.newPatches || 0;
            }

            // Load patches for each selected vendor
            for (const vendor of currentFilters.vendors) {
                try {
                    const response = await fetch(`data/vendors/${vendor}.json`);
                    if (response.ok) {
                        const data = await response.json();
                        patches = patches.concat(data.patches);
                    } else {
                        console.warn(`No patch data available for ${vendor}`);
                    }
                } catch (error) {
                    console.warn(`Failed to load patches for ${vendor}:`, error);
                }
            }

            // Update fetch status and logs
            const now = new Date();
            const logEntry = {
                timestamp: now,
                vendors: Array.from(currentFilters.vendors),
                patchCount: patches.length,
                newPatches: newPatchCount
            };
            fetchLogs.push(logEntry);
            
            updateFetchStatus(now, patches.length, newPatchCount);
            applyFilters();
        } catch (error) {
            console.error('Error loading patches:', error);
            patchFeed.innerHTML = '<div class="error">Error loading patches</div>';
        }
    }

    function applyFilters() {
        if (!patches.length) {
            patchFeed.innerHTML = '<div class="no-results">No patches found</div>';
            return;
        }

        const filteredPatches = patches.filter(patch => {
            // Check severity
            if (!currentFilters.severities.has(patch.severity)) {
                return false;
            }

            // Check dates
            if (currentFilters.startDate || currentFilters.endDate) {
                const patchDate = new Date(patch.date);
                if (currentFilters.startDate && patchDate < currentFilters.startDate) {
                    return false;
                }
                if (currentFilters.endDate && patchDate > currentFilters.endDate) {
                    return false;
                }
            }

            return true;
        });

        displayPatches(filteredPatches);
    }

    function displayPatches(patches) {
        if (!patches.length) {
            patchFeed.innerHTML = '<div class="no-results">No patches found</div>';
            return;
        }

        // Sort patches by date (newest first)
        patches.sort((a, b) => new Date(b.date) - new Date(a.date));

        patchFeed.innerHTML = patches.map(patch => `
            <div class="patch-card severity-${patch.severity.toLowerCase()}">
                <div class="patch-header">
                    <h3>${patch.title}</h3>
                    <span class="date">${new Date(patch.date).toLocaleDateString()}</span>
                </div>
                <p class="description">${patch.description}</p>
                <div class="patch-meta">
                    <span class="vendor">${patch.vendor.toUpperCase()}</span>
                    <span class="severity">Severity: ${patch.severity}</span>
                    <span class="component">Component: ${patch.component}</span>
                </div>
                <a href="${patch.link}" target="_blank" class="more-info">More Info</a>
            </div>
        `).join('');
    }

    async function displayFetchLogs() {
        try {
            const response = await fetch('data/patches.json');
            const data = await response.json();
            const fetchLogs = data.fetchLogs || [];

            const logContent = fetchLogs.map(log => {
                const newPatchesSection = log.newPatches && log.newPatches.length > 0 ? `
                    <div class="new-patches-section">
                        <h4>New Patches Found:</h4>
                        ${log.newPatches.map(patch => `
                            <div class="patch-item">
                                <span class="vendor">${patch.vendor}</span>
                                <span class="title">${patch.title}</span>
                                <span class="date">${new Date(patch.date).toLocaleDateString()}</span>
                                <span class="severity severity-${patch.severity.toLowerCase()}">${patch.severity}</span>
                            </div>
                        `).join('')}
                    </div>
                ` : '';

                const vendorLogs = log.logs.map(logLine => {
                    const match = logLine.match(/\[(SUCCESS|INFO|ERROR)\] (.+)/);
                    if (match) {
                        return `<div class="log-line ${match[1].toLowerCase()}">${match[2]}</div>`;
                    }
                    return `<div class="log-line">${logLine}</div>`;
                }).join('');

                return `
                    <div class="patch-card">
                        <div class="patch-header">
                            <h3>Fetch at ${new Date(log.timestamp).toLocaleString()}</h3>
                        </div>
                        <div class="patch-meta">
                            <span>Vendors Checked: ${log.vendors.length}</span>
                            <span>${log.totalPatches} total patches</span>
                            ${log.newPatchCount > 0 ? `<span class="new-patches">${log.newPatchCount} new patches</span>` : ''}
                        </div>
                        ${newPatchesSection}
                        <div class="vendor-logs">
                            <h4>Vendor Status:</h4>
                            ${vendorLogs}
                        </div>
                    </div>
                `;
            }).join('');

            patchFeed.innerHTML = `
                <a href="#" class="log-link back-to-patches">← Back to Patches</a>
                <h2 class="section-header">New Patches Loaded</h2>
                ${logContent || '<div class="no-results">No fetch logs available</div>'}
            `;

            // Add event listener to the back button
            document.querySelector('.back-to-patches').addEventListener('click', (e) => {
                e.preventDefault();
                applyFilters();
            });
        } catch (error) {
            console.error('Error loading fetch logs:', error);
            patchFeed.innerHTML = '<div class="error">Error loading fetch logs</div>';
        }
    }

    // Load patches for all vendors
    loadAndDisplayPatches();
});
