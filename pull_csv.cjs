cat << 'EOF' > pull_csv.cjs
const fs = require('fs');
const https = require('https');

const URL = "https://raw.githubusercontent.com/markopie/Yoga-App-Evolution/main/asana_library.json";
const OUTPUT_FILE = "asana_library.csv";

console.log("Fetching JSON from GitHub...");

https.get(URL, (res) => {
    let body = "";
    res.on("data", (chunk) => body += chunk);
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
}).on("error", (e) => console.error("❌ Error:", e.message));

function convertToCSV(objData) {
    const rows = [];
    // Force specific column order (ID first, then Name, then Shorthand)
    const headers = new Set(["id", "english", "sanskrit", "shorthand"]); 

    Object.entries(objData).forEach(([key, val]) => {
        // 1. Create Base Row
        const rowData = { id: key, ...val };

        // 2. EXTRACTION LOGIC: Pull 'shorthand' out of 'variations'
        if (val.variations && typeof val.variations === 'object') {
            const shorthands = [];
            
            // Loop through Stage I, Stage II, etc.
            Object.entries(val.variations).forEach(([stageKey, stageData]) => {
                if (stageData.shorthand) {
                    // Format: "Stage I: [The Shorthand]"
                    shorthands.push(`${stageKey}: ${stageData.shorthand}`);
                }
            });

            // Join them with a newline so they stay in one cell but are readable
            if (shorthands.length > 0) {
                rowData["shorthand"] = shorthands.join("\n");
            }
        }

        // 3. Collect all other headers
        Object.keys(rowData).forEach(k => headers.add(k));
        rows.push(rowData);
    });

    const headerList = Array.from(headers);

    // 4. Build CSV Rows
    const csvRows = rows.map(row => {
        return headerList.map(fieldName => {
            let val = row[fieldName] || "";
            
            // If it's the remaining complex object (like the full variations data), stringify it
            if (typeof val === 'object') val = JSON.stringify(val);
            
            // Clean up string for CSV (escape quotes)
            val = String(val).replace(/"/g, '""');
            
            // Wrap in quotes to handle the newlines we added
            return `"${val}"`;
        }).join(",");
    });

    return [headerList.join(","), ...csvRows].join("\n");
}
EOF

# Run the script immediately
node pull_csv.cjs