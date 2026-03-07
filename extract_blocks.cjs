const fs = require('fs');

const appFile = 'app.js';
let appCode = fs.readFileSync(appFile, 'utf8');
const lines = appCode.split('\n');

const region7Start = lines.findIndex(l => l.includes('// #region 7. UI & BROWSING'));
const region8Start = lines.findIndex(l => l.includes('// #region 8. ADMIN & DATA LAYER'));
const renderListStart = lines.findIndex((l, i) => i >= region7Start && l.includes('function renderBrowseList('));
const applyFiltersStart = lines.findIndex((l, i) => i >= region7Start && l.includes('function applyBrowseFilters()'));

if ([region7Start, region8Start, renderListStart, applyFiltersStart].includes(-1)) {
    console.error('Could not find all boundaries');
    process.exit(1);
}

function processBlock(code) {
    let newCode = code;
    newCode = newCode.replace(/^(\s*)function\s+([a-zA-Z0-9_]+)\s*\(/gm, '$1export function $2(');
    newCode = newCode.replace(/^(\s*)async\s+function\s+([a-zA-Z0-9_]+)\s*\(/gm, '$1export async function $2(');
    return newCode;
}

// Block 1: Modal Logic
let modalCode = lines.slice(region7Start + 1, renderListStart).join('\n');
modalCode = processBlock(modalCode);
modalCode = modalCode.replace(/window\.openBrowse\s*=\s*(?:async\s+)?function\s*\(\)/, 'export async function openBrowse()');
modalCode = modalCode.replace(/const openBrowse = window\.openBrowse;/, '// removed');

// Block 2: Renderers
let renderersCode = lines.slice(renderListStart, applyFiltersStart).join('\n');
renderersCode = processBlock(renderersCode);

// Block 3: Filters
let filtersCode = lines.slice(applyFiltersStart, region8Start).join('\n');
filtersCode = processBlock(filtersCode);

const header = `import { $, normaliseText } from '../utils/dom.js';
import { normalizePlate } from '../services/dataAdapter.js';

const asanaLibraryProxy = new Proxy({}, {
    get: function(target, prop) {
        if (!window.asanaLibrary) return undefined;
        return window.asanaLibrary[prop];
    },
    ownKeys: function(target) {
        return window.asanaLibrary ? Reflect.ownKeys(window.asanaLibrary) : [];
    },
    getOwnPropertyDescriptor: function(target, prop) {
        return window.asanaLibrary ? Reflect.getOwnPropertyDescriptor(window.asanaLibrary, prop) : undefined;
    }
});
const asanaLibrary = asanaLibraryProxy;

const getAsanaLibrary = () => window.asanaLibrary;
const displayName = (a) => window.displayName ? window.displayName(a) : (a.name || a.english);
const prefersIAST = () => window.prefersIAST ? window.prefersIAST() : false;
const smartUrlsForPoseId = (id) => window.smartUrlsForPoseId ? window.smartUrlsForPoseId(id) : [];
const formatTechniqueText = (t) => window.formatTechniqueText ? window.formatTechniqueText(t) : t;
const playAsanaAudio = (a, b, c) => window.playAsanaAudio && window.playAsanaAudio(a, b, c);
const stopTimer = () => window.stopTimer && window.stopTimer();
const setPose = (i) => window.setPose && window.setPose(i);
const isBrowseMobile = () => window.isBrowseMobile ? window.isBrowseMobile() : false;
const urlsForPlateToken = (t) => window.urlsForPlateToken ? window.urlsForPlateToken(t) : [];

const setState = (seq, idx, run) => {
    if (window.setPlayerState) window.setPlayerState(seq, idx, run);
};

const applyBrowseFilters = () => window.applyBrowseFilters && window.applyBrowseFilters();
const closeBrowse = () => window.closeBrowse && window.closeBrowse();
const enterBrowseDetailMode = () => window.enterBrowseDetailMode && window.enterBrowseDetailMode();
const exitBrowseDetailMode = () => window.exitBrowseDetailMode && window.exitBrowseDetailMode();
const renderBrowseList = (items) => window.renderBrowseList && window.renderBrowseList(items);
const showAsanaDetail = (asma) => window.showAsanaDetail && window.showAsanaDetail(asma);

`;

renderersCode = renderersCode.replace(/running\s*=\s*false;/g, 'setState(undefined, undefined, false);');
renderersCode = renderersCode.replace(/currentSequence\s*=\s*\{([^}]*)\};/g, 'setState({$1}, undefined, undefined);');
renderersCode = renderersCode.replace(/currentIndex\s*=\s*0;/g, 'setState(undefined, 0, undefined);');

fs.writeFileSync('src/ui/browseModal.js', header + '\n' + modalCode);
fs.writeFileSync('src/ui/browseRenderers.js', header + '\n' + renderersCode);
fs.writeFileSync('src/ui/browseFilters.js', header + '\n' + filtersCode);

const appBefore = lines.slice(0, region7Start + 1).join('\n');
const appAfter = lines.slice(region8Start).join('\n');

const replacement = `
import * as BrowseModal from './src/ui/browseModal.js';
import * as BrowseRenderers from './src/ui/browseRenderers.js';
import * as BrowseFilters from './src/ui/browseFilters.js';

window.setupBrowseUI = BrowseModal.setupBrowseUI;
window.openBrowse = BrowseModal.openBrowse;
window.closeBrowse = BrowseModal.closeBrowse;
window.enterBrowseDetailMode = BrowseModal.enterBrowseDetailMode;
window.exitBrowseDetailMode = BrowseModal.exitBrowseDetailMode;

window.renderBrowseList = BrowseRenderers.renderBrowseList;
window.startBrowseAsana = BrowseRenderers.startBrowseAsana;
window.showAsanaDetail = BrowseRenderers.showAsanaDetail;
window.renderPlateSection = BrowseRenderers.renderPlateSection;

window.applyBrowseFilters = BrowseFilters.applyBrowseFilters;
window.matchesText = BrowseFilters.matchesText;
window.parsePlateQuery = BrowseFilters.parsePlateQuery;
window.matchesPlate = BrowseFilters.matchesPlate;
window.matchesAsanaNo = BrowseFilters.matchesAsanaNo;
window.matchesCategory = BrowseFilters.matchesCategory;
window.setStatus = BrowseFilters.setStatus;
window.showError = BrowseFilters.showError;

window.displayName = typeof displayName !== 'undefined' ? displayName : undefined;
window.playAsanaAudio = typeof playAsanaAudio !== 'undefined' ? playAsanaAudio : undefined;
window.prefersIAST = typeof prefersIAST !== 'undefined' ? prefersIAST : undefined;
window.smartUrlsForPoseId = typeof smartUrlsForPoseId !== 'undefined' ? smartUrlsForPoseId : undefined;
window.formatTechniqueText = typeof formatTechniqueText !== 'undefined' ? formatTechniqueText : undefined;
window.urlsForPlateToken = typeof urlsForPlateToken !== 'undefined' ? urlsForPlateToken : undefined;
window.stopTimer = typeof stopTimer !== 'undefined' ? stopTimer : undefined;
window.setPose = typeof setPose !== 'undefined' ? setPose : undefined;
window.isBrowseMobile = typeof isBrowseMobile !== 'undefined' ? isBrowseMobile : undefined;

window.setPlayerState = function(seq, idx, run) {
    if (seq !== undefined) currentSequence = seq;
    if (idx !== undefined) currentIndex = idx;
    if (run !== undefined) running = run;
};
`;

fs.writeFileSync(appFile, appBefore + '\n' + replacement + '\n' + appAfter);
console.log('Extraction complete.');
