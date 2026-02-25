import axios from 'axios';
import * as cheerio from 'cheerio';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class VendorPatchFetcher {
  constructor(vendorName) {
    this.vendorName = vendorName;
    this.filePath = path.join(__dirname, `../data/vendors/${vendorName}.json`);
    this.logs = [];
    this.lookbackDays = parseInt(process.env.LOOKBACK_DAYS || '7', 10);
    // Health tracking — populated during fetch
    this._healthMeta = {
      fetchAttempted: true,
      httpSuccess: false,
      itemsParsed: 0,
      newPatchesFound: 0,
      error: null
    };
  }

  log(message, type = 'INFO') {
    const logEntry = `[${type}] ${new Date().toISOString()} - ${this.vendorName}: ${message}`;
    this.logs.push(logEntry);
    console.log(logEntry);
  }

  // Emit GitHub Actions annotations so warnings/errors surface in the UI
  ghWarning(message) {
    if (process.env.GITHUB_ACTIONS) {
      console.log(`::warning title=${this.vendorName}::${message}`);
    }
  }

  ghError(message) {
    if (process.env.GITHUB_ACTIONS) {
      console.log(`::error title=${this.vendorName}::${message}`);
    }
  }

  getSevenDaysAgo() {
    const date = new Date();
    date.setDate(date.getDate() - this.lookbackDays);
    return date;
  }

  async fetchWithRetry(url, options = {}, maxRetries = 4) {
    let lastError;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          // Longer backoff for rate limits: 6s, 12s, 24s, 48s
          const delay = Math.pow(2, attempt) * 3000;
          this.log(`Retry attempt ${attempt + 1}/${maxRetries} after ${delay / 1000}s delay`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
        const response = await axios.get(url, {
          ...options,
          timeout: options.timeout || 30000
        });
        this._healthMeta.httpSuccess = true;
        return response;
      } catch (error) {
        lastError = error;
        const status = error.response?.status;
        if (status === 429 || status === 404 || (status >= 500 && status < 600)) {
          this.log(`Request failed with status ${status}, will retry...`, 'WARN');
          continue;
        }
        throw error;
      }
    }
    throw lastError;
  }

  async readExistingData() {
    try {
      if (fs.existsSync(this.filePath)) {
        const data = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
        return data;
      }
      return { patches: [], health: {} };
    } catch (error) {
      this.log(`Error reading existing data: ${error.message}`, 'ERROR');
      return { patches: [], health: {} };
    }
  }

  async mergePatches(existingData, newPatches) {
    const allPatches = [...existingData.patches];
    let addedCount = 0;

    for (const newPatch of newPatches) {
      const exists = allPatches.some(p =>
        p.title === newPatch.title &&
        p.date === newPatch.date
      );

      if (!exists) {
        allPatches.push(newPatch);
        addedCount++;
      }
    }

    allPatches.sort((a, b) => new Date(b.date) - new Date(a.date));

    return { addedCount, allPatches };
  }

  async saveData(patches, health) {
    try {
      const data = {
        vendor: this.vendorName,
        lastUpdated: new Date().toISOString(),
        health,
        patches
      };

      fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2));
      this.log('Successfully saved patch data');
    } catch (error) {
      this.log(`Error saving data: ${error.message}`, 'ERROR');
      throw error;
    }
  }

  // Extract all CVE IDs from a text string
  extractCVEs(text) {
    if (!text) return [];
    const matches = text.match(/CVE-\d{4}-\d{4,}/g);
    return matches ? [...new Set(matches)] : [];
  }

  // Derive severity from text keywords
  getSeverityFromText(text) {
    if (!text) return 'UNKNOWN';
    const lower = text.toLowerCase();
    if (lower.includes('critical')) return 'CRITICAL';
    if (lower.includes('high') || lower.includes('important')) return 'HIGH';
    if (lower.includes('medium') || lower.includes('moderate')) return 'MEDIUM';
    if (lower.includes('low')) return 'LOW';
    return 'UNKNOWN';
  }

  // Strip HTML tags and collapse whitespace
  cleanHtml(text) {
    if (!text) return '';
    return text
      .replace(/<[^>]*>/g, ' ')
      .replace(/&[a-z]+;/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  async updatePatchData(newPatches) {
    try {
      const existingData = await this.readExistingData();
      const { addedCount, allPatches } = await this.mergePatches(existingData, newPatches);

      this._healthMeta.itemsParsed = newPatches.length;
      this._healthMeta.newPatchesFound = addedCount;

      // Build health record
      const now = new Date().toISOString();
      const prevHealth = existingData.health || {};
      const health = {
        lastFetchAttempt: now,
        lastFetchResult: newPatches.length > 0 ? 'ok' : 'empty',
        lastFetchParsedItems: newPatches.length,
        lastFetchNewPatches: addedCount,
        // Track when we last actually found something (for staleness detection)
        lastSuccessWithData: newPatches.length > 0
          ? now
          : (prevHealth.lastSuccessWithData || null),
        consecutiveEmptyFetches: newPatches.length > 0
          ? 0
          : (prevHealth.consecutiveEmptyFetches || 0) + 1,
        error: null
      };

      // Staleness warnings
      if (health.consecutiveEmptyFetches >= 4) {
        const msg = `${this.vendorName}: ${health.consecutiveEmptyFetches} consecutive fetches returned 0 patches — collector may be broken`;
        this.log(msg, 'WARN');
        this.ghWarning(msg);
      }

      if (health.lastSuccessWithData) {
        const daysSinceData = (Date.now() - new Date(health.lastSuccessWithData).getTime()) / 86400000;
        if (daysSinceData > 45) {
          const msg = `${this.vendorName}: No new patches found in ${Math.round(daysSinceData)} days — data source may have changed`;
          this.log(msg, 'WARN');
          this.ghWarning(msg);
        }
      }

      await this.saveData(allPatches, health);

      this.log(`Found ${newPatches.length} patches, added ${addedCount} new patches. Total: ${allPatches.length}`);
      return this.logs;
    } catch (error) {
      this._healthMeta.error = error.message;
      this.log(`Failed to update patch data: ${error.message}`, 'ERROR');
      this.ghError(`Fetch failed: ${error.message}`);
      throw error;
    }
  }
}

export default VendorPatchFetcher;
