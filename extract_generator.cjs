const fs = require('fs');

let content = fs.readFileSync('app.js', 'utf8').replace(/
/g, '
');
const sIdx = content.indexOf('// #region 9. SEQUENCE GENERATOR');
const eIdx = content.indexOf('// #region 10. MODALS & EDITORS');

if (sIdx > -1 && eIdx > -1) {
    let modalContent = content.substring(sIdx, eIdx);
    content = content.substring(0, sIdx) + content.substring(eIdx);
    
    fs.writeFileSync('app.js', content);
    
    let imports = `import { $, showError } from '../utils/dom.js';

const getSequences = () => window.sequences;
`;
    
    let fileOut = imports + modalContent + `
// Export Generator elements here if needed
`;
    fs.writeFileSync('src/ui/generator.js', fileOut);
    console.log("Extracted generator.js");
} else {
    console.log("Could not find Generator markers", {sIdx, eIdx});
}
