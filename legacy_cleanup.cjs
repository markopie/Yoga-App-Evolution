const fs = require('fs');

let code = fs.readFileSync('app.js', 'utf8');

// 1. Remove globals
code = code.replace(new RegExp('let imageOverrides = \\{\\};\\r?\\n'), '');
code = code.replace(new RegExp('let audioOverrides = \\{\\}; ?\\r?\\n'), '');
code = code.replace(new RegExp('let audioOverrides = \\{\\};\\r?\\n'), '');
code = code.replace(new RegExp('let descriptionOverrides = \\{\\};.*\\r?\\n'), '');
code = code.replace(new RegExp('let categoryOverrides = \\{\\};.*\\r?\\n'), '');
code = code.replace(new RegExp('\\/\\/ Admin Overrides\\r?\\n'), '');

// 2. Remove from init()
code = code.replace(new RegExp('typeof fetchAudioOverrides === "function" \\? fetchAudioOverrides\\(\\) : Promise\\.resolve\\(\\),\\r?\\n\\s*', 'g'), '');
code = code.replace(new RegExp('typeof fetchImageOverrides === "function" \\? fetchImageOverrides\\(\\) : Promise\\.resolve\\(\\),\\r?\\n\\s*', 'g'), '');
code = code.replace(new RegExp('typeof fetchDescriptionOverrides === "function" \\? fetchDescriptionOverrides\\(\\) : Promise\\.resolve\\(\\),\\r?\\n\\s*', 'g'), '');
code = code.replace(new RegExp('typeof fetchCategoryOverrides === "function" \\? fetchCategoryOverrides\\(\\) : Promise\\.resolve\\(\\),\\r?\\n\\s*', 'g'), '');

code = code.replace(new RegExp('\\/\\/ 4\\. Apply Overrides\\r?\\n\\s*if \\(typeof applyDescriptionOverrides === "function"\\) applyDescriptionOverrides\\(\\);\\r?\\n\\s*if \\(typeof applyCategoryOverrides === "function"\\) applyCategoryOverrides\\(\\);\\r?\\n', 'g'), '');

// 3. Remove override block from smartUrlsForPoseId
const overrideImgPattern = new RegExp('\\/\\/ 1\\. Check Overrides[\\s\\S]*?\\/\\/ 2\\. Check Index');
code = code.replace(overrideImgPattern, '// 1. Check Index');

// 4. Remove override block from playPoseMainAudio
const overrideAudioPattern = new RegExp('\\/\\/ 3\\. Override Check[\\s\\S]*?if \\(overrideSrc\\) \\{[\\s\\S]*?return;\\s*\\}');
code = code.replace(overrideAudioPattern, '');

// 5. Remove the actual override fetch and apply functions
const fetchOverridesPattern = new RegExp('async function fetchDescriptionOverrides\\(\\) \\{[\\s\\S]*?function applyCategoryOverrides\\(\\) \\{[\\s\\S]*?\\}\\r?\\n', 'g');
code = code.replace(fetchOverridesPattern, '');
code = code.replace(new RegExp('\\/\\* ==========================================================================\\r?\\n\\s*DATA APPLICATION \\(APPLY LEGACY OVERRIDES\\)\\r?\\n\\s*========================================================================== \\*\\/', 'g'), '');

// 6. Remove GitHub sync tools
const githubStart = code.indexOf('// -------- GITHUB SYNC --------');
const githubEndStr = '/* ==========================================================================\r\n   FULL ASANA EDITOR (Supabase Upsert)';
const githubEndAlt = '/* ==========================================================================\n   FULL ASANA EDITOR (Supabase Upsert)';
let githubEnd = code.indexOf(githubEndStr);
if(githubEnd === -1) githubEnd = code.indexOf(githubEndAlt);

if (githubStart !== -1 && githubEnd !== -1) {
    code = code.substring(0, githubStart) + code.substring(githubEnd);
}

fs.writeFileSync('app.js', code);
console.log('Legacy cleanup executed.');
