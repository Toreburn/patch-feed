export default async function handler(req, res) {
    const allowedOrigin = process.env.ALLOWED_ORIGIN || '';

    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { vendorName, feedUrl, notes } = req.body || {};

    if (!vendorName || typeof vendorName !== 'string' || !vendorName.trim()) {
        return res.status(400).json({ error: 'Vendor name is required' });
    }

    const ghToken = process.env.GITHUB_TOKEN;
    if (!ghToken) {
        console.error('GITHUB_TOKEN not configured');
        return res.status(500).json({ error: 'Server configuration error' });
    }

    // Build issue body
    const bodyLines = [
        '## Vendor Request',
        '',
        `**Vendor Name:** ${vendorName.trim()}`,
    ];

    if (feedUrl && feedUrl.trim()) {
        bodyLines.push(`**Security Feed URL:** ${feedUrl.trim()}`);
    }

    if (notes && notes.trim()) {
        bodyLines.push('', `**Notes:** ${notes.trim()}`);
    }

    try {
        const ghRes = await fetch('https://api.github.com/repos/Toreburn/patch-feed/issues', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${ghToken}`,
                'Accept': 'application/vnd.github+json',
                'Content-Type': 'application/json',
                'X-GitHub-Api-Version': '2022-11-28',
            },
            body: JSON.stringify({
                title: `Vendor Request: ${vendorName.trim()}`,
                body: bodyLines.join('\n'),
                labels: ['vendor-request'],
            }),
        });

        if (!ghRes.ok) {
            const errData = await ghRes.json().catch(() => ({}));
            console.error('GitHub API error:', ghRes.status, errData);
            return res.status(502).json({ error: 'Failed to create issue' });
        }

        return res.status(200).json({ success: true });
    } catch (err) {
        console.error('Request to GitHub failed:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
