import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const workflowsDir = path.join(__dirname, '..', '.github', 'workflows');
const files = fs.readdirSync(workflowsDir);

// Only process vendor patch workflow files
const vendorWorkflows = files.filter(f => f.endsWith('-patches.yml'));

vendorWorkflows.forEach(file => {
  const filePath = path.join(workflowsDir, file);
  let content = fs.readFileSync(filePath, 'utf8');

  // Update permissions section
  content = content.replace(
    /permissions:\n(\s+[a-z-]+: write\n?)+/g,
    'permissions:\n      contents: write\n      id-token: write\n      pages: write\n'
  );

  // Update GitHub Pages deployment steps
  content = content.replace(
    /\s+- name: Deploy to GitHub Pages\n\s+if: success\(\)\n\s+uses: actions\/deploy-pages@v4\n\s+with:\n\s+token: \$\{\{ secrets\.GITHUB_TOKEN \}\}/g,
    `

      - name: Setup Pages
        uses: actions/configure-pages@v4

      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: '.'

      - name: Deploy to GitHub Pages
        id: deployment
        if: success()
        uses: actions/deploy-pages@v4`
  );

  // Fix any broken indentation from the commit step
  content = content.replace(
    /\|\| \(git commit -m .* && git push\).*- name: Setup Pages/s,
    '|| (git commit -m "Update patch data [skip ci]" && git push)\n\n      - name: Setup Pages'
  );

  fs.writeFileSync(filePath, content);
});

console.log(`Updated ${vendorWorkflows.length} workflow files`);
