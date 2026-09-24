const { cpSync, mkdirSync } = require('node:fs');
const { join } = require('node:path');

const projectRoot = join(__dirname, '..');
const sourceViews = join(projectRoot, 'src', 'web', 'views');
const builtViews = join(projectRoot, 'dist', 'web', 'views');

mkdirSync(builtViews, { recursive: true });
cpSync(sourceViews, builtViews, { recursive: true, force: true });
console.log('Copied web views to dist/web/views');
