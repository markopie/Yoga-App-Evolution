const fs = require('fs');

const appFile = 'app.js';
let appCode = fs.readFileSync(appFile, 'utf8');

const startTag = '// #region 7. UI & BROWSING';
const endTag = '// #region 8. ADMIN & DATA LAYER';

const startIdx = appCode.indexOf(startTag);
const endIdx = appCode.indexOf(endTag);

if (startIdx === -1 || endIdx === -1) {
    console.error('Could not find region tags');
    process.exit(1);
}

const regionCode = appCode.slice(startIdx + startTag.length, endIdx);

// Define what functions go to which file
const blockConfig = {
    'browseModal.js': ['setupBrowseUI', 'openBrowse', 'closeBrowse', 'enterBrowseDetailMode', 'exitBrowseDetailMode'],
    'browseFilters.js': ['applyBrowseFilters', 'matchesText', 'parsePlateQuery', 'matchesPlate', 'matchesAsanaNo', 'matchesCategory', 'setStatus', 'showError'],
    'browseRenderers.js': ['renderBrowseList', 'startBrowseAsana', 'showAsanaDetail', 'renderPlateSection', 'renderMissingSection', 'buildMissingPlatesUI']
};

let remainingCode = regionCode;

// Create the directory if it doesn't exist
if (!fs.existsSync('src/ui')) {
    fs.mkdirSync('src/ui', { recursive: true });
}

// We will just put everything in one file for now, but split by exports.
// Actually, let's put it in `src/ui/browse.js` because they are so heavily intertwined.
// Wait, the prompt asked for "3 large logical blocks (e.g., Modal View logic, Search/Filter Utilities, and SVG/Card Renderers) into the /src folder."

let modalCode = '';
let filterCode = '';
let rendererCode = '';

// Quick and dirty manual split of the text
const setupBrowseUIMatch = regionCode.match(/function setupBrowseUI\(\) \{[\s\S]*?(?=
const openBrowse)/);
const openBrowseMatch = regionCode.match(/const openBrowse[\s\S]*?(?=
function renderBrowseList)/);
const renderListMatch = regionCode.match(/function renderBrowseList\([\s\S]*?(?=
function applyBrowseFilters)/);
const applyFiltersMatch = regionCode.match(/function applyBrowseFilters\(\) \{[\s\S]*?(?=
function setStatus)/);
const utilsMatch = regionCode.match(/function setStatus\([\s\S]*?(?=
function enterBrowseDetailMode)/);
const detailModeMatch = regionCode.match(/function enterBrowseDetailMode\(\) \{[\s\S]*?(?=
\/\* ===)/);

modalCode = 
`import { $ } from '../utils/dom.js';
import { applyBrowseFilters } from './browseFilters.js';

` + (setupBrowseUIMatch ? setupBrowseUIMatch[0] : '') + '
' + (openBrowseMatch ? openBrowseMatch[0] : '') + '
' + (detailModeMatch ? detailModeMatch[0] : '');

filterCode = 
`import { $, normaliseText } from '../utils/dom.js';
import { renderBrowseList } from './browseRenderers.js';
import { normalizePlate } from '../services/dataAdapter.js';

` + (applyFiltersMatch ? applyFiltersMatch[0] : '') + '
' + (utilsMatch ? utilsMatch[0] : '');

rendererCode = 
`import { $ } from '../utils/dom.js';
import { enterBrowseDetailMode, closeBrowse } from './browseModal.js';
import { normalizePlate } from '../services/dataAdapter.js';

` + (renderListMatch ? renderListMatch[0] : '');

// Instead of regex slicing which is prone to missing things, let's just create 3 files by regexing the functions properly, OR just put all of Region 7 into `src/ui/browseManager.js` and export them. If the user specifically said "extract 3 large logical blocks... into the /src folder", I should create 3 files.

fs.writeFileSync('temp_refactor.js', 'Ready to implement advanced extraction.');
