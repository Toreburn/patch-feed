document.addEventListener('DOMContentLoaded', () => {
    const patchFeed = document.getElementById('patch-feed');
    const vendorCheckboxes = document.querySelectorAll('input[name="vendor"]');
    const severityCheckboxes = document.querySelectorAll('input[name="severity"]');
    const startDate = document.getElementById('start-date');
    const endDate = document.getElementById('end-date');
    const toggleButton = document.getElementById('toggle-all');
    const metaUpdated = document.getElementById('meta-updated');
    const metaCount = document.getElementById('meta-count');
    const sidebar = document.getElementById('sidebar');
    const menuBtn = document.getElementById('menu-btn');
    const sidebarClose = document.getElementById('sidebar-close');

    const STORAGE_KEY = 'patchfeed_prefs';

    const availableVendors = [
        'microsoft', 'apple', 'redhat', 'ubuntu', 'suse', 'vmware', 'citrix', 'proxmox', 'debian', 'android',
        'chrome', 'firefox', 'edge', 'safari', 'zoom', 'signal', 'teams', 'slack',
        'oracle-db', 'salesforce', 'mssql', 'postgresql', 'atlassian', 'sap', 'mysql', 'servicenow', 'ivanti',
        'cisco', 'fortinet', 'paloalto', 'checkpoint', 'juniper', 'sonicwall', 'sophos', 'symantec', 'f5', 'aruba', 'trendmicro', 'crowdstrike', 'zscaler',
        'adobe', 'jetbrains', 'visualstudio', 'gitlab', 'github', 'nodejs', 'docker',
        'aws', 'azure', 'gcp', 'ibm', 'cloudflare', 'kubernetes',
        'dell', 'hpe', 'lenovo'
    ];

    let patches = [];
    let currentFilters = {
        vendors: new Set(),
        severities: new Set(),
        startDate: null,
        endDate: null
    };

    // ── Persistence ──
    function loadPrefs() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) return JSON.parse(raw);
        } catch {}
        return null;
    }

    function savePrefs() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({
                vendors: Array.from(currentFilters.vendors),
                severities: Array.from(currentFilters.severities),
                startDate: startDate.value,
                endDate: endDate.value
            }));
        } catch {}
    }

    // ── Date helpers ──
    const fmtDate = d => d.toISOString().split('T')[0];
    function parseLocalDate(s) {
        if (!s) return null;
        const [y, m, d] = s.split('-').map(Number);
        return new Date(y, m - 1, d);
    }

    // ── Init filters from saved prefs or defaults ──
    const saved = loadPrefs();

    if (saved) {
        // Restore vendors
        const savedVendors = new Set(saved.vendors || []);
        vendorCheckboxes.forEach(cb => {
            if (!availableVendors.includes(cb.value)) {
                cb.disabled = true;
                cb.parentElement.classList.add('disabled');
                cb.parentElement.title = 'Data not available';
            } else {
                cb.checked = savedVendors.has(cb.value);
                if (cb.checked) currentFilters.vendors.add(cb.value);
            }
        });

        // Restore severity
        const savedSev = new Set(saved.severities || []);
        severityCheckboxes.forEach(cb => {
            cb.checked = savedSev.has(cb.value);
            if (cb.checked) currentFilters.severities.add(cb.value);
        });

        // Restore dates
        startDate.value = saved.startDate || '';
        endDate.value = saved.endDate || '';
        currentFilters.startDate = parseLocalDate(startDate.value);
        currentFilters.endDate = parseLocalDate(endDate.value);
    } else {
        // First visit defaults: all vendors checked, Critical+High, last 365 days
        vendorCheckboxes.forEach(cb => {
            if (!availableVendors.includes(cb.value)) {
                cb.disabled = true;
                cb.parentElement.classList.add('disabled');
                cb.parentElement.title = 'Data not available';
            } else {
                cb.checked = true;
                currentFilters.vendors.add(cb.value);
            }
        });

        severityCheckboxes.forEach(cb => {
            if (cb.checked) currentFilters.severities.add(cb.value);
        });

        const today = new Date(); today.setHours(0, 0, 0, 0);
        const yearAgo = new Date(); yearAgo.setDate(today.getDate() - 365); yearAgo.setHours(0, 0, 0, 0);
        startDate.value = fmtDate(yearAgo);
        endDate.value = fmtDate(today);
        currentFilters.startDate = yearAgo;
        currentFilters.endDate = today;
    }

    // Update toggle button text based on state
    function updateToggleText() {
        const allChecked = Array.from(vendorCheckboxes).filter(cb => !cb.disabled).every(cb => cb.checked);
        toggleButton.textContent = allChecked ? 'Uncheck All' : 'Check All';
    }
    updateToggleText();

    // ── Mobile sidebar ──
    menuBtn.addEventListener('click', () => sidebar.classList.add('open'));
    sidebarClose.addEventListener('click', () => sidebar.classList.remove('open'));

    // ── Vendor search ──
    const vendorSearch = document.getElementById('vendor-search');
    if (vendorSearch) {
        vendorSearch.addEventListener('input', e => {
            const term = e.target.value.toLowerCase();
            vendorCheckboxes.forEach(cb => {
                const label = cb.parentElement;
                label.style.display = label.textContent.toLowerCase().includes(term) ? '' : 'none';
            });
            document.querySelectorAll('.vendor-group-title').forEach(title => {
                const group = title.parentElement;
                const hasVisible = Array.from(group.querySelectorAll('label')).some(l => l.style.display !== 'none');
                title.style.display = hasVisible ? '' : 'none';
            });
        });
    }

    // ── Vendor checkbox events ──
    vendorCheckboxes.forEach(cb => {
        cb.addEventListener('change', () => {
            if (cb.disabled) return;
            cb.checked ? currentFilters.vendors.add(cb.value) : currentFilters.vendors.delete(cb.value);
            updateToggleText();
            savePrefs();
            loadAndDisplayPatches();
        });
    });

    toggleButton.addEventListener('click', () => {
        const checking = toggleButton.textContent === 'Check All';
        vendorCheckboxes.forEach(cb => {
            if (!cb.disabled) {
                cb.checked = checking;
                checking ? currentFilters.vendors.add(cb.value) : null;
            }
        });
        if (!checking) currentFilters.vendors.clear();
        updateToggleText();
        savePrefs();
        loadAndDisplayPatches();
    });

    // ── Severity filter events ──
    severityCheckboxes.forEach(cb => {
        cb.addEventListener('change', () => {
            cb.checked ? currentFilters.severities.add(cb.value) : currentFilters.severities.delete(cb.value);
            savePrefs();
            applyFilters();
        });
    });

    // ── Date filter events ──
    startDate.addEventListener('change', () => { currentFilters.startDate = parseLocalDate(startDate.value); savePrefs(); applyFilters(); });
    endDate.addEventListener('change', () => { currentFilters.endDate = parseLocalDate(endDate.value); savePrefs(); applyFilters(); });

    // ── Data loading ──
    async function loadPatchesJson() {
        try {
            const r = await fetch('data/patches.json');
            return r.ok ? await r.json() : null;
        } catch { return null; }
    }

    function updateMeta(timestamp, count, newCount) {
        metaUpdated.textContent = `Updated ${timestamp.toLocaleDateString()} ${timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
        metaCount.textContent = `${count} patches` + (newCount > 0 ? ` (+${newCount} new)` : '');
    }

    async function loadAndDisplayPatches() {
        if (currentFilters.vendors.size === 0) {
            patchFeed.innerHTML = '<div class="no-results">Select vendors to view patches</div>';
            metaUpdated.textContent = '';
            metaCount.textContent = '';
            return;
        }

        patchFeed.innerHTML = '<div class="loading">Loading patches</div>';
        patches = [];
        let newPatchCount = 0;
        let lastUpdated = null;

        try {
            const patchesData = await loadPatchesJson();
            if (patchesData) {
                newPatchCount = patchesData.newPatches || 0;
                lastUpdated = patchesData.lastUpdated ? new Date(patchesData.lastUpdated) : null;
            }

            const fetches = Array.from(currentFilters.vendors).map(async vendor => {
                try {
                    const r = await fetch(`data/vendors/${vendor}.json`);
                    if (!r.ok) return;
                    return await r.json();
                } catch { return null; }
            });

            const results = await Promise.all(fetches);
            for (const data of results) {
                if (!data) continue;
                patches.push(...(data.patches || []));
                if (data.lastUpdated) {
                    const d = new Date(data.lastUpdated);
                    if (!lastUpdated || d > lastUpdated) lastUpdated = d;
                }
            }

            updateMeta(lastUpdated || new Date(), patches.length, newPatchCount);
            applyFilters();
        } catch (err) {
            console.error('Error loading patches:', err);
            patchFeed.innerHTML = '<div class="error-msg">Error loading patches</div>';
        }
    }

    // ── Filtering ──
    function applyFilters() {
        if (!patches.length) {
            patchFeed.innerHTML = '<div class="no-results">No patches found</div>';
            return;
        }

        const filtered = patches.filter(p => {
            const sev = (p.severity || '').toLowerCase();
            const sevMatch = Array.from(currentFilters.severities).some(s =>
                s.toLowerCase() === sev || (s.toLowerCase() === 'high' && sev === 'important')
            );
            if (!sevMatch) return false;

            if (currentFilters.startDate || currentFilters.endDate) {
                const [y, m, d] = p.date.split('-').map(Number);
                const pd = new Date(y, m - 1, d);
                if (currentFilters.startDate && pd < currentFilters.startDate) return false;
                if (currentFilters.endDate && pd > currentFilters.endDate) return false;
            }
            return true;
        });

        displayPatches(filtered);
    }

    // ── Helpers ──
    function sanitizeText(t) {
        if (!t) return '';
        let c = t.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().replace(/\*\*/g, '').replace(/##/g, '');
        return c.length > 200 ? c.substring(0, 200) + '...' : c;
    }

    function escapeHtml(t) {
        if (!t) return '';
        return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    }

    function isValidUrl(u) {
        if (!u || typeof u !== 'string') return false;
        try { return ['http:', 'https:'].includes(new URL(u).protocol); } catch { return false; }
    }

    // ── Rendering ──
    function displayPatches(list) {
        if (!list.length) {
            patchFeed.innerHTML = '<div class="no-results">No patches match your filters</div>';
            return;
        }

        list.sort((a, b) => new Date(b.date) - new Date(a.date));

        patchFeed.innerHTML = list.map(p => {
            const sev = (p.severity || 'unknown').toLowerCase();
            let displaySev = sev.charAt(0).toUpperCase() + sev.slice(1);
            if (displaySev === 'Unknown') displaySev = 'Bug Fix';

            const title = escapeHtml(sanitizeText(p.title));
            const desc = escapeHtml(sanitizeText(p.description));
            const comp = escapeHtml(p.component || '');
            const vendor = escapeHtml((p.vendor || '').toUpperCase());
            const cvss = p.cvss || p.cvssScore || null;
            const cve = escapeHtml(p.cve || '');

            return `<div class="patch-card severity-${sev}">
                <div class="patch-header">
                    <h3>${title}</h3>
                    <span class="date">${new Date(p.date).toLocaleDateString()}</span>
                </div>
                ${desc ? `<p class="description">${desc}</p>` : ''}
                <div class="patch-meta">
                    <span class="tag tag-vendor">${vendor}</span>
                    <span class="tag tag-severity-${sev}">${displaySev}</span>
                    ${cvss ? `<span class="tag tag-cvss" title="CVSS Base Score">CVSS ${cvss}</span>` : ''}
                    ${cve ? `<span class="tag tag-cve">${cve}</span>` : ''}
                    ${comp ? `<span class="tag">${comp}</span>` : ''}
                </div>
                ${isValidUrl(p.link) ? `<a href="${escapeHtml(p.link)}" target="_blank" rel="noopener noreferrer" class="more-info">View details &rarr;</a>` : ''}
            </div>`;
        }).join('');
    }

    // ── Fetch logs view ──
    document.getElementById('view-logs').addEventListener('click', e => {
        e.preventDefault();
        displayFetchLogs();
    });

    async function displayFetchLogs() {
        try {
            const r = await fetch('data/patches.json');
            const data = await r.json();
            const logs = data.fetchLogs || [];

            const html = logs.map(log => {
                const npSection = log.newPatches?.length > 0 ? `
                    <div class="new-patches-section">
                        <h4>New Patches</h4>
                        ${log.newPatches.map(p => `
                            <div class="patch-item">
                                <span class="vendor">${escapeHtml(p.vendor)}</span>
                                <span class="title">${escapeHtml(p.title)}</span>
                                <span class="date">${new Date(p.date).toLocaleDateString()}</span>
                            </div>
                        `).join('')}
                    </div>` : '';

                let ok = 0, fail = 0;
                (log.logs || []).forEach(l => { if (l.includes('[SUCCESS]')) ok++; else if (l.includes('[ERROR]')) fail++; });

                const vendorLines = (log.logs || []).map(l => {
                    const m = l.match(/\[(SUCCESS|INFO|ERROR)\] ([^\s-]+)\s*-?\s*(.*)/);
                    if (m) {
                        const s = m[1].toLowerCase();
                        return `<div class="log-line ${s}"><span class="status-icon"></span><span class="vendor-name">${escapeHtml(m[2])}</span><span class="status-text">${escapeHtml(m[3] || s)}</span></div>`;
                    }
                    return `<div class="log-line"><span class="status-icon"></span><span class="vendor-name">${escapeHtml(l)}</span></div>`;
                }).join('');

                return `<div class="patch-card">
                    <div class="patch-header"><h3>Fetch at ${new Date(log.timestamp).toLocaleString()}</h3></div>
                    <div class="patch-meta">
                        <span class="tag">Vendors: ${log.vendors?.length || 0}</span>
                        <span class="tag">${log.totalPatches || 0} patches</span>
                        ${log.newPatchCount > 0 ? `<span class="tag" style="color:var(--success)">${log.newPatchCount} new</span>` : ''}
                    </div>
                    ${npSection}
                    <div class="vendor-logs">
                        <h4>Vendor Status</h4>
                        <div class="log-summary">
                            ${ok > 0 ? `<div class="log-summary-item success-count">${ok} successful</div>` : ''}
                            ${fail > 0 ? `<div class="log-summary-item error-count">${fail} failed</div>` : ''}
                        </div>
                        <div class="log-grid">${vendorLines}</div>
                    </div>
                </div>`;
            }).join('');

            patchFeed.innerHTML = `
                <a href="#" class="back-link" id="back-to-patches">&larr; Back to Patches</a>
                <h2 class="section-header">Fetch Logs</h2>
                ${html || '<div class="no-results">No fetch logs available</div>'}
            `;

            document.getElementById('back-to-patches').addEventListener('click', e => { e.preventDefault(); applyFilters(); });
        } catch (err) {
            console.error('Error loading fetch logs:', err);
            patchFeed.innerHTML = '<div class="error-msg">Error loading fetch logs</div>';
        }
    }

    // ── Vendor Request Modal ──
    const vendorModal = document.getElementById('vendor-modal');
    const vendorForm = document.getElementById('vendor-request-form');
    const formMessage = document.getElementById('form-message');
    const modalSubmitBtn = document.getElementById('modal-submit');

    const VENDOR_API_URL = 'https://patch-feed-main.vercel.app/api/vendor-request';

    function openModal() {
        vendorModal.hidden = false;
        document.getElementById('vendor-name').focus();
    }

    function closeModal() {
        vendorModal.hidden = true;
        vendorForm.reset();
        formMessage.hidden = true;
        formMessage.className = 'form-message';
        modalSubmitBtn.disabled = false;
        modalSubmitBtn.textContent = 'Submit Request';
    }

    document.getElementById('request-vendor-btn').addEventListener('click', openModal);
    document.getElementById('modal-close').addEventListener('click', closeModal);
    document.getElementById('modal-cancel').addEventListener('click', closeModal);

    vendorModal.addEventListener('click', e => {
        if (e.target === vendorModal) closeModal();
    });

    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && !vendorModal.hidden) closeModal();
    });

    vendorForm.addEventListener('submit', async e => {
        e.preventDefault();

        const vendorName = document.getElementById('vendor-name').value.trim();
        const feedUrl = document.getElementById('feed-url').value.trim();
        const notes = document.getElementById('request-notes').value.trim();

        if (!vendorName) return;

        modalSubmitBtn.disabled = true;
        modalSubmitBtn.textContent = 'Submitting...';
        formMessage.hidden = true;

        try {
            const res = await fetch(VENDOR_API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ vendorName, feedUrl, notes })
            });

            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.error || 'Request failed');
            }

            formMessage.textContent = 'Vendor request submitted successfully!';
            formMessage.className = 'form-message success';
            formMessage.hidden = false;

            setTimeout(closeModal, 2000);
        } catch (err) {
            formMessage.textContent = err.message || 'Something went wrong. Please try again.';
            formMessage.className = 'form-message error';
            formMessage.hidden = false;
            modalSubmitBtn.disabled = false;
            modalSubmitBtn.textContent = 'Submit Request';
        }
    });

    // ── Init ──
    loadAndDisplayPatches();
});
