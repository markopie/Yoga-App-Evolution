const fs = require('fs');
const code = fs.readFileSync('app.js', 'utf8');

function extractFunc(name, isVar = false) {
    const regex = isVar 
        ? new RegExp('^(?:window\\.)?' + name + '\\s*=\\s*(?:async\\s+)?function\\s*\\([^)]*\\)\\s*\\{', 'm')
        : new RegExp('^(?:async\\s+)?function\\s+' + name + '\\s*\\([^)]*\\)\\s*\\{', 'm');
    const match = code.match(regex);
    if (!match) return null;
    
    let startIdx = match.index;
    let openBraces = 0;
    let endIdx = -1;
    let inString = false;
    let stringChar = '';
    
    for (let i = startIdx + match[0].length - 1; i < code.length; i++) {
        const char = code[i];
        
        if (!inString) {
            if (char === "'" || char === '"' || char === '`') {
                inString = true;
                stringChar = char;
            } else if (char === '{') {
                openBraces++;
            } else if (char === '}') {
                openBraces--;
                if (openBraces === 0) {
                    endIdx = i + 1;
                    break;
                }
            }
        } else {
            if (char === stringChar && code[i-1] !== '\\') {
                inString = false;
            }
        }
    }
    
    if (endIdx !== -1) {
        return {
            name,
            content: code.substring(startIdx, endIdx),
            start: startIdx,
            end: endIdx
        };
    }
    return null;
}

const funcsToExtract = {
    modal: ['setupBrowseUI', 'closeBrowse', 'enterBrowseDetailMode', 'exitBrowseDetailMode'],
    filters: ['applyBrowseFilters', 'matchesText', 'parsePlateQuery', 'matchesPlate', 'matchesAsanaNo', 'matchesCategory'],
    renderers: ['renderBrowseList', 'showAsanaDetail', 'startBrowseAsana']
};

let extracted = {};
for (let key in funcsToExtract) {
    extracted[key] = [];
    for (let name of funcsToExtract[key]) {
        let ext = extractFunc(name);
        if (!ext && (name === 'applyBrowseFilters' || name === 'setupBrowseUI' || name === 'openBrowse')) {
            ext = extractFunc(name, true);
        }
        if (!ext) {
            console.log('NOT FOUND:', name);
            continue;
        }
        extracted[key].push(ext);
    }
}

for (let key in extracted) {
    console.log(key, 'count:', extracted[key].length);
    let totalLen = extracted[key].reduce((acc, curr) => acc + curr.content.split('\\n').length, 0);
    console.log(key, 'lines:', totalLen);
}

const openBrowseMatch = extractFunc('openBrowse', true);
if (openBrowseMatch) {
    console.log('window.openBrowse FOUND, length:', openBrowseMatch.content.split('\\n').length);
} else {
    console.log('window.openBrowse NOT FOUND');
}
