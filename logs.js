async function loadLogs() {
    try {
        const response = await fetch('data/patches.json');
        const data = await response.json();

        document.getElementById('fetch-time').textContent = `Last updated: ${new Date(data.lastUpdated).toLocaleString()}`;
        document.getElementById('fetch-count').textContent = `${data.patches?.length || 0} total patches tracked`;

        const logs = data.fetchLogs || [];
        const container = document.getElementById('detailed-logs');

        if (!logs.length) {
            container.innerHTML = '<div class="no-results">No fetch logs available</div>';
            return;
        }

        container.innerHTML = logs.map(log => {
            let ok = 0, fail = 0;
            (log.logs || []).forEach(l => {
                if (l.includes('[SUCCESS]')) ok++;
                else if (l.includes('[ERROR]')) fail++;
            });

            const lines = (log.logs || []).map(l => {
                const m = l.match(/\[(SUCCESS|INFO|ERROR)\]\s*(.*)/);
                const status = m ? m[1].toLowerCase() : 'info';
                const text = m ? m[2] : l;
                return `<div class="log-line ${status}"><span class="status-icon"></span><span class="vendor-name">${text}</span></div>`;
            }).join('');

            return `<div class="patch-card" style="margin-bottom:16px">
                <div class="patch-header"><h3>Fetch at ${new Date(log.timestamp).toLocaleString()}</h3></div>
                <div class="patch-meta" style="margin-top:10px">
                    <span class="tag">Vendors: ${log.vendors?.length || 0}</span>
                    <span class="tag">${log.totalPatches || 0} patches</span>
                    ${log.newPatchCount > 0 ? `<span class="tag" style="color:var(--success)">${log.newPatchCount} new</span>` : ''}
                </div>
                <div class="log-summary" style="margin-top:12px">
                    ${ok > 0 ? `<div class="log-summary-item success-count">${ok} successful</div>` : ''}
                    ${fail > 0 ? `<div class="log-summary-item error-count">${fail} failed</div>` : ''}
                </div>
                <div class="log-grid" style="margin-top:8px">${lines}</div>
            </div>`;
        }).join('');
    } catch (error) {
        console.error('Error loading logs:', error);
        document.getElementById('detailed-logs').innerHTML = '<div class="error-msg">Error loading fetch logs</div>';
    }
}

document.addEventListener('DOMContentLoaded', loadLogs);
setInterval(loadLogs, 5 * 60 * 1000);
