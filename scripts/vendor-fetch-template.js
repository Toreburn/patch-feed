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
  }

  log(message, type = 'INFO') {
    const logEntry = `[${type}] ${new Date().toISOString()} - ${this.vendorName}: ${message}`;
    this.logs.push(logEntry);
    console.log(logEntry);
  }

  getSevenDaysAgo() {
    const date = new Date();
    date.setDate(date.getDate() - 7);
    return date;
  }

  async readExistingData() {
    try {
      if (fs.existsSync(this.filePath)) {
        const data = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
        return data;
      }
      return { patches: [] };
    } catch (error) {
      this.log(`Error reading existing data: ${error.message}`, 'ERROR');
      return { patches: [] };
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

    // Sort by date (newest first)
    allPatches.sort((a, b) => new Date(b.date) - new Date(a.date));

    return {
      addedCount,
      allPatches
    };
  }

  async saveData(patches) {
    try {
      const data = {
        vendor: this.vendorName,
        lastUpdated: new Date().toISOString(),
        patches
      };

      fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2));
      this.log('Successfully saved patch data');
    } catch (error) {
      this.log(`Error saving data: ${error.message}`, 'ERROR');
      throw error;
    }
  }

  async updatePatchData(newPatches) {
    try {
      const existingData = await this.readExistingData();
      const { addedCount, allPatches } = await this.mergePatches(existingData, newPatches);
      
      await this.saveData(allPatches);
      
      this.log(`Found ${newPatches.length} patches, added ${addedCount} new patches. Total: ${allPatches.length}`);
      return this.logs;
    } catch (error) {
      this.log(`Failed to update patch data: ${error.message}`, 'ERROR');
      throw error;
    }
  }
}

export default VendorPatchFetcher;
