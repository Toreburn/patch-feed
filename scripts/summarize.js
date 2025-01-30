#!/usr/bin/env node

/**
 * This script provides consistent patch summarization by:
 * 1. Extracting key information from patch descriptions
 * 2. Using templates to generate consistent summaries
 * 3. Preserving vendor-provided severity levels
 */

// Common vulnerability types and their descriptions
const vulnTypes = {
    'RCE': 'remote code execution',
    'SQLi': 'SQL injection',
    'XSS': 'cross-site scripting',
    'CSRF': 'cross-site request forgery',
    'BufferOverflow': 'buffer overflow',
    'PrivEsc': 'privilege escalation',
    'InfoDisclosure': 'information disclosure',
    'DoS': 'denial of service'
};

/**
 * Extracts the most relevant vulnerability types from the text
 */
function extractVulnTypes(text) {
    text = text.toLowerCase();
    return Object.entries(vulnTypes)
        .filter(([_, desc]) => text.includes(desc))
        .map(([type, _]) => type);
}

/**
 * Generates a standardized summary from patch information
 */
function generateSummary(patch) {
    const vulnTypes = extractVulnTypes(patch.description);
    
    // Build summary based on available information
    let summary = '';
    
    if (vulnTypes.length > 0) {
        summary = `Security update addressing ${vulnTypes.join(', ')} vulnerabilities`;
    } else if (patch.description.toLowerCase().includes('security')) {
        summary = 'Security update addressing multiple vulnerabilities';
    } else {
        summary = 'Update containing security fixes and improvements';
    }

    // Add component information if available
    if (patch.component) {
        summary += ` in ${patch.component}`;
    }

    return {
        ...patch,
        description: summary
    };
}

/**
 * Process an array of patches to add consistent summaries
 */
function processPatchData(patches) {
    return patches.map(generateSummary);
}

module.exports = {
    processPatchData,
    extractVulnTypes,
    generateSummary
};
