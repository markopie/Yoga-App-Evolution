
const checkFile = require("eslint-plugin-check-file");

module.exports = [
    {
        // TARGET: Only check JS files to ensure no parsing errors
        files: ["**/*.js"],
        
        // IGNORE: Don't lint the config file itself
        ignores: ["eslint.config.js"],

        plugins: {
            "check-file": checkFile
        },
        
        rules: {
            // Rule 1: Files must be kebab-case
            "check-file/filename-naming-convention": [
                "error",
                { "**/*.js": "KEBAB_CASE" }
            ],

            // Rule 2: Strict Folder Structure
            // If these files exist, they MUST be in the correct folder
            "check-file/folder-match-with-fex": [
                "error",
                {
                    "**/utils.js": "**/lib/",
                    "**/image-manager.js": "**/lib/",
                    "**/history.js": "**/lib/"
                }
            ]
        }
    }
];
