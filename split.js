const fs = require('fs');

const appCode = fs.readFileSync('app.js', 'utf8');
const startTag = '// #region 7. UI & BROWSING';
const endTag = '// #region 8. ADMIN & DATA LAYER';

const startIdx = appCode.indexOf(startTag);
const endIdx = appCode.indexOf(endTag);
let regionCode = appCode.slice(startIdx + startTag.length, endIdx);

// Let's modify regionCode to add exports.
// function name(...) -> export function name(...)
regionCode = regionCode.replace(/^(\s*)function\s+([a-zA-Z0-9_]+)/gm, '$1export function $2');
// async function name(...) -> export async function name(...)
regionCode = regionCode.replace(/^(\s*)async\s+function\s+([a-zA-Z0-9_]+)/gm, '$1export async function $2');

// Fix window.openBrowse
regionCode = regionCode.replace(/window\.openBrowse = async function\(\)/, 'export async function openBrowse()');
regionCode = regionCode.replace(/const openBrowse = window\.openBrowse;/, '');

// We need to inject window. globals for dependencies that aren't imported.
// In app.js, we will make these global. In the extracted files, we just use them or rely on window.
// Actually, it's easier to just access global variables directly since in browser they are on window,
// EXCEPT `let` and `const` from module scope are NOT on window.
// So we must attach them to window in app.js OR pass them.

const finalFileContent = `
import { $, normaliseText } from '../utils/dom.js';
import { normalizePlate } from '../services/dataAdapter.js';

// We map module-scoped variables from app.js to window to maintain functionality
const asanaLibrary = new Proxy({}, { get: (_, prop) => window.asanaLibrary[prop] });
const displayName = (a) => window.displayName(a);
const prefersIAST = () => window.prefersIAST();
const smartUrlsForPoseId = (id) => window.smartUrlsForPoseId(id);
const formatTechniqueText = (t) => window.formatTechniqueText(t);
const playAsanaAudio = (a, b, c) => window.playAsanaAudio(a, b, c);
const stopTimer = () => window.stopTimer();
const setPose = (i) => window.setPose(i);
const isBrowseMobile = () => window.isBrowseMobile();
const urlsForPlateToken = (t) => window.urlsForPlateToken(t);

` + regionCode;

// Instead of splitting into 3 files and dealing with massive circular dependency hell between
// setupBrowseUI, applyBrowseFilters, renderBrowseList, closeBrowse, openBrowse, etc.,
// I will create ONE "browseManager.js" first, OR I will split them properly into 3 files.
// Let's try splitting them into 3 files.

const funcsModal = ['setupBrowseUI', 'openBrowse', 'closeBrowse', 'enterBrowseDetailMode', 'exitBrowseDetailMode'];
const funcsFilters = ['applyBrowseFilters', 'matchesText', 'parsePlateQuery', 'matchesPlate', 'matchesAsanaNo', 'matchesCategory', 'setStatus', 'showError'];
const funcsRenderers = ['renderBrowseList', 'startBrowseAsana', 'showAsanaDetail', 'renderPlateSection', 'renderMissingSection', 'buildMissingPlatesUI'];

function extractFunc(code, name) {
    const regex = new RegExp('^\s*export\s+(?:async\s+)?function\s+' + name + '\s*\(', 'm');
    const match = code.match(regex);
    if (!match) return null;
    
    let start = match.index;
    let openBraces = 0;
    let end = -1;
    let inString = false;
    let stringChar = '';
    
    for (let i = start + match[0].length; i < code.length; i++) {
        const char = code[i];
        if (!inString) {
            if (char === "'" || char === '"' || char === '`') {
                inString = true;
                stringChar = char;
            } else if (char === '{') openBraces++;
            else if (char === '}') {
                openBraces--;
                if (openBraces === -1) { // we started inside the parenthesis before the first brace, so the first { makes it 0, wait no.
                    // Actually, let's just find the first { 
                }
            }
        } else {
            if (char === stringChar && code[i-1] !== '') inString = false;
        }
    }
}
// Regex extraction is safer for simple functions. Let's use the Babel/Acorn parser or just split by "export function"
`;
fs.writeFileSync('split.cjs', content);
