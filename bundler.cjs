const fs = require('fs');
const path = require('path');

const outputFile = 'updated_project_context.txt';
const allowedExts = ['.html', '.js', '.css', '.json'];
const ignoredDirs = ['node_modules', '.git', '.stackblitz'];

function scanDir(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        if (stat && stat.isDirectory()) {
            if (!ignoredDirs.includes(file) && !file.startsWith('.')) {
                results = results.concat(scanDir(filePath));
            }
        } else {
            if (allowedExts.includes(path.extname(file)) && !file.startsWith('.')) {
                results.push(filePath);
            }
        }
    });
    return results;
}

console.log("Scanning files...");
const allFiles = scanDir('.');
let outputContent = "";

allFiles.forEach(file => {
    try {
        const content = fs.readFileSync(file, 'utf8');
        outputContent += `\n--- START OF FILE: ${file} ---\n`;
        outputContent += content;
        outputContent += `\n--- END OF FILE: ${file} ---\n`;
    } catch (e) {
        console.log(`Skipping ${file}: ${e.message}`);
    }
});

fs.writeFileSync(outputFile, outputContent);
console.log(`Success! Bundled ${allFiles.length} files into '${outputFile}'`);