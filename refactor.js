const fs = require('fs');
const path = require('path');

const appJsPath = 'app.js';
const adapterJsPath = path.join('src', 'services', 'dataAdapter.js');

let content = fs.readFileSync(appJsPath, 'utf8');

function extractFunction(name, source) {
    const regex1 = new RegExp(`(?:async\s+)?function\s+${name}\s*\([^)]*\)\s*\{`, 'm');
    const regex2 = new RegExp(`(?:const|let|var|window\.)\s*${name}\s*=\s*(?:async\s+)?(?:function)?\s*\([^)]*\)\s*(?:=>\s*)?\{`, 'm');
    
    let match = source.match(regex1) || source.match(regex2);
    if (!match) return { body: null, newSource: source };
    
    const startIdx = match.index;
    let braceCount = 0;
    let inString = false;
    let stringChar = '';
    let escape = false;
    
    for (let i = startIdx + match[0].length - 1; i < source.length; i++) {
        const char = source[i];
        
        if (escape) {
            escape = false;
            continue;
        }
        
        if (char === '') {
            escape = true;
            continue;
        }
        
        if (inString) {
            if (char === stringChar) {
                inString = false;
            }
        } else {
            if (char === "'" || char === '"' || char === '`') {
                inString = true;
                stringChar = char;
            } else if (char === '{') {
                braceCount++;
            } else if (char === '}') {
                braceCount--;
                if (braceCount === 0) {
                    const endIdx = i + 1;
                    const body = source.substring(startIdx, endIdx);
                    const newSource = source.substring(0, startIdx) + source.substring(endIdx);
                    return { body, newSource };
                }
            }
        }
    }
    return { body: null, newSource: source };
}

const funcsToMove = [
    'loadAsanaLibrary', 
    'normalizeAsana', 
    'normalizeAsanaRow', 
    'normalizePlate', 
    'parsePlates', 
    'normaliseAsanaId'
];

let extractedFuncs = [];
let foundFuncNames = [];

for (const func of funcsToMove) {
    const { body, newSource } = extractFunction(func, content);
    if (body) {
        extractedFuncs.push(body);
        foundFuncNames.push(func);
        content = newSource;
    }
}

let adapterCode = `import { supabase } from './supabaseClient.js';
import { parseHoldTimes } from '../utils/parsing.js';

${extractedFuncs.join('

')}

export { ${foundFuncNames.join(', ')} };
`;

fs.writeFileSync(adapterJsPath, adapterCode, 'utf8');

const importStatement = `import { ${foundFuncNames.join(', ')} } from './src/services/dataAdapter.js';
`;
const importInsertPos = content.indexOf('import { supabase } from');
if (importInsertPos !== -1) {
    content = content.substring(0, importInsertPos) + importStatement + content.substring(importInsertPos);
} else {
    content = importStatement + content;
}

fs.writeFileSync(appJsPath, content, 'utf8');

console.log(`Successfully moved ${foundFuncNames.length} functions to ${adapterJsPath}`);
