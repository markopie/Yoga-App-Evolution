// pull_csv.js
const fs = require('fs');
const https = require('https');

const URL = "https://raw.githubusercontent.com/markopie/Yoga-App-Evolution/main/asana_library.json";
const OUTPUT_FILE = "asana_library.csv";

console.log("Fetching JSON from GitHub...");

https.get(URL, (res) => {
    let body = "";

    res.on("data", (chunk) => {
        body += chunk;
    });

    res.on("end", () => {
        try {
            const data = JSON.parse(body);
            const csv = convertToCSV(data);
            fs.writeFileSync(OUTPUT_FILE, csv);
            console.log(`✅ Success! Saved to ${OUTPUT_FILE}`);
        } catch (error) {
            console.error("❌ Error parsing JSON:", error.message);
        }
    });

}).on("error", (error) => {
    console.error("❌ Error fetching URL:", error.message);
});

function convertToCSV(objData) {
    const rows = [];
    const headers = new Set(["id"]); // ID first

    // 1. Flatten Data & Collect Headers
    Object.entries(objData).forEach(([key, val]) => {
        // Ensure the Key (ID) is part of the data row
        const rowData = { id: key, ...val };
        
        Object.keys(rowData).forEach(k => headers.add(k));
        rows.push(rowData);
    });

    const headerList = Array.from(headers);

    // 2. Build CSV Content
    const csvRows = rows.map(row => {
        return headerList.map(fieldName => {
            let val = row[fieldName] || "";
            
            // Handle Arrays/Objects (like 'variations')
            if (typeof val === 'object') {
                val = JSON.stringify(val);
            }
            
            val = String(val);

            // Escape quotes (replace " with "")
            val = val.replace(/"/g, '""');
            
            // Wrap in quotes to handle commas and newlines safely
            return `"${val}"`;
        }).join(",");
    });

    // Combine Header + Rows
    return [headerList.join(","), ...csvRows].join("\n");
}
