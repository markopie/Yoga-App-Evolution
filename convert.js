import fs from 'fs';

const INPUT_FILE = "asana_library.json";
const OUTPUT_FILE = "asana_library.csv";

console.log(`Reading ${INPUT_FILE}...`);

try {
    // Read the local JSON file instead of making a network request
    const rawData = fs.readFileSync(INPUT_FILE, 'utf8');
    const data = JSON.parse(rawData);
    
    // Convert and save
    const csv = convertToCSV(data);
    fs.writeFileSync(OUTPUT_FILE, csv);
    
    console.log(`✅ Success! Saved to ${OUTPUT_FILE}`);
} catch (error) {
    console.error("❌ Error:", error.message);
}

function convertToCSV(objData) {
    const rows = [];
    // Define exact column order
    const headers = new Set(["id", "name", "iast", "category", "shorthand"]); 

    Object.entries(objData).forEach(([key, val]) => {
        const rowData = { id: key, ...val };

        // --- LOGIC: Extract Shorthand from Variations ---
        if (val.variations && typeof val.variations === 'object') {
            const shorthandList = [];
            
            Object.entries(val.variations).forEach(([stageKey, stageData]) => {
                if (stageData.shorthand) {
                    // Format: "Stage I: [Text]"
                    shorthandList.push(`${stageKey}: ${stageData.shorthand}`);
                }
            });

            if (shorthandList.length > 0) {
                rowData["shorthand"] = shorthandList.join("\n");
            }
        }
        // ------------------------------------------------

        Object.keys(rowData).forEach(k => headers.add(k));
        rows.push(rowData);
    });

    const headerList = Array.from(headers);

    const csvRows = rows.map(row => {
        return headerList.map(fieldName => {
            let val = row[fieldName];
            
            if (val === null || val === undefined) return "";
            
            // Stringify objects (like the leftover variations object)
            if (typeof val === 'object') val = JSON.stringify(val);
            
            val = String(val).replace(/"/g, '""'); // Escape quotes
            return `"${val}"`; // Wrap in quotes
        }).join(",");
    });

    return [headerList.join(","), ...csvRows].join("\n");
}
