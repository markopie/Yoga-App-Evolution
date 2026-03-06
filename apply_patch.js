const fs = require('fs');
const path = require('path');

const appJsPath = 'app.js';
const adapterJsPath = path.join('src', 'services', 'dataAdapter.js');

const extracted = JSON.parse(fs.readFileSync('extracted.json', 'utf8'));
const funcNames = Object.keys(extracted);

let adapterCode = "import { supabase } from './supabaseClient.js';
";
adapterCode += "import { parseHoldTimes } from '../utils/parsing.js';

";

for (const name of funcNames) {
    adapterCode += extracted[name] + "

";
}

adapterCode += "export { " + funcNames.join(', ') + " };
";

fs.writeFileSync(adapterJsPath, adapterCode, 'utf8');

let appContent = fs.readFileSync(appJsPath, 'utf8');

// Replace each function with empty string
for (const name of funcNames) {
    appContent = appContent.replace(extracted[name], '');
}

const importStatement = "import { " + funcNames.join(', ') + " } from './src/services/dataAdapter.js';
";

const importInsertPos = appContent.indexOf('import { supabase } from');
if (importInsertPos !== -1) {
    appContent = appContent.substring(0, importInsertPos) + importStatement + appContent.substring(importInsertPos);
} else {
    appContent = importStatement + appContent;
}

fs.writeFileSync(appJsPath, appContent, 'utf8');
console.log('Successfully created dataAdapter.js and updated app.js');
