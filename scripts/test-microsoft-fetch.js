import axios from 'axios';
import * as cheerio from 'cheerio';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function fetchMicrosoftPatches() {
  try {
    // Fetch from Microsoft Security Response Center blog
    const response = await axios.get('https://msrc.microsoft.com/blog/feed', {
      headers: {
        'Accept': 'application/rss+xml'
      }
    });
    
    const $ = cheerio.load(response.data, { xmlMode: true });
    const patches = [];
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    
    // Parse the blog feed for security updates
    $('item').each((i, item) => {
      const $item = $(item);
      const title = $item.find('title').text().trim();
      const pubDate = new Date($item.find('pubDate').text());
      const description = $item.find('description').text().trim();
      const link = $item.find('link').text().trim();
      
      // Only include security updates from last 6 months
      if (pubDate >= sixMonthsAgo && 
          (title.toLowerCase().includes('security update') || 
           title.toLowerCase().includes('patch tuesday'))) {
        const dateStr = pubDate.toISOString().split('T')[0];
      
        patches.push({
          title,
          date: dateStr,
          severity: "Critical",
          vendor: "microsoft",
          component: "Multiple Products",
          description: description.replace(/<[^>]*>/g, '').substring(0, 200) + '...',
          link
        });
      }
    });

    // Read existing file if it exists
    const filePath = path.join(__dirname, '../data/vendors/microsoft.json');
    let existingData = { patches: [] };
    
    if (fs.existsSync(filePath)) {
      existingData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }

    // Merge new patches with existing ones, avoiding duplicates
    const allPatches = [...existingData.patches];
    
    for (const newPatch of patches) {
      const exists = allPatches.some(p => 
        p.title === newPatch.title && 
        p.date === newPatch.date
      );
      
      if (!exists) {
        allPatches.push(newPatch);
      }
    }

    // Sort by date (newest first)
    allPatches.sort((a, b) => new Date(b.date) - new Date(a.date));

    // Write updated data
    fs.writeFileSync(filePath, JSON.stringify({
      vendor: "microsoft",
      lastUpdated: new Date().toISOString(),
      patches: allPatches
    }, null, 2));

    console.log(`Successfully updated Microsoft patches. Total patches: ${allPatches.length}`);
    console.log('New patches found:', patches.length);
    if (patches.length > 0) {
      console.log('Latest patch:', patches[0]);
    }
  } catch (error) {
    console.error('Error fetching Microsoft patches:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
    process.exit(1);
  }
}

// Execute if run directly
fetchMicrosoftPatches();
