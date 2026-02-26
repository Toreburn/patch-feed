// Simple in-memory rate limiter (resets on cold start)
const rateLimit = new Map();
const RATE_WINDOW_MS = 3600000; // 1 hour
const RATE_MAX = 5; // max requests per IP per window

function checkRateLimit(ip) {
    const now = Date.now();
    const entry = rateLimit.get(ip);
    if (!entry || now > entry.resetAt) {
        rateLimit.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
        return true;
    }
    entry.count++;
    return entry.count <= RATE_MAX;
}

function sanitizeMarkdown(str) {
    return str.replace(/[[\]()@#*`~>!|\\]/g, '');
}

function validateUrl(str) {
    try {
        const parsed = new URL(str);
        return ['http:', 'https:'].includes(parsed.protocol);
    } catch {
        return false;
    }
}

export default async function handler(req, res) {
    const allowedOrigin = process.env.ALLOWED_ORIGIN || '';

    if (allowedOrigin === '*') {
        console.error('ALLOWED_ORIGIN must not be wildcard');
        return res.status(500).json({ error: 'Server misconfiguration' });
    }

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

    // Rate limit by IP
    const forwarded = req.headers['x-forwarded-for'];
    const ip = forwarded ? forwarded.split(',')[0].trim() : 'unknown';
    if (!checkRateLimit(ip)) {
        return res.status(429).json({ error: 'Too many requests. Try again later.' });
    }

    const { vendorName, feedUrl, notes } = req.body || {};

    // Type validation
    if (!vendorName || typeof vendorName !== 'string' || !vendorName.trim()) {
        return res.status(400).json({ error: 'Vendor name is required' });
    }
    if (feedUrl !== undefined && feedUrl !== null && typeof feedUrl !== 'string') {
        return res.status(400).json({ error: 'Invalid feed URL' });
    }
    if (notes !== undefined && notes !== null && typeof notes !== 'string') {
        return res.status(400).json({ error: 'Invalid notes' });
    }

    // Length validation
    if (vendorName.trim().length > 200) {
        return res.status(400).json({ error: 'Vendor name too long' });
    }
    if (feedUrl && feedUrl.trim().length > 2000) {
        return res.status(400).json({ error: 'Feed URL too long' });
    }
    if (notes && notes.trim().length > 5000) {
        return res.status(400).json({ error: 'Notes too long' });
    }

    // URL validation
    if (feedUrl && feedUrl.trim() && !validateUrl(feedUrl.trim())) {
        return res.status(400).json({ error: 'Invalid URL format or protocol' });
    }

    const ghToken = process.env.GITHUB_TOKEN;
    if (!ghToken) {
        console.error('GITHUB_TOKEN not configured');
        return res.status(500).json({ error: 'Server configuration error' });
    }

    // Sanitize inputs for Markdown injection
    const safeName = sanitizeMarkdown(vendorName.trim());
    const safeUrl = feedUrl ? sanitizeMarkdown(feedUrl.trim()) : '';
    const safeNotes = notes ? sanitizeMarkdown(notes.trim()) : '';

    // Build issue body
    const bodyLines = [
        '## Vendor Request',
        '',
        `**Vendor Name:** ${safeName}`,
    ];

    if (safeUrl) {
        bodyLines.push(`**Security Feed URL:** ${safeUrl}`);
    }

    if (safeNotes) {
        bodyLines.push('', `**Notes:** ${safeNotes}`);
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
                title: `Vendor Request: ${safeName.substring(0, 100)}`,
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
