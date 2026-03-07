const fs = require('fs');
const { old } = JSON.parse(fs.readFileSync('temp_replace.json', 'utf8'));

const newContent = `window.loadCourses = async function() {
    const deduplicated = await fetchCourses(window.currentUserId);
    window.courses = deduplicated;
    courses = deduplicated;
    sequences = deduplicated;

    if (typeof renderSequenceDropdown === "function") renderSequenceDropdown(); 
};`;

const app = fs.readFileSync('app.js', 'utf8');
const updatedApp = app.replace(old, newContent);
fs.writeFileSync('app.js', updatedApp);
