import js from "@eslint/js";
import checkFile from "eslint-plugin-check-file";
import globals from "globals";

export default [
    {
        // 1. GLOBAL IGNORES 
        ignores: ["dist/**", "**/node_modules/**", "build/**", "scripts/legacy/**"]
    },
    {
        files: ["**/*.js", "**/*.cjs"],
        // Add this 'ignores' line here as well to protect this specific file from naming rules
        ignores: ["eslint.config.js"], 
        plugins: {
            "check-file": checkFile
        },
        languageOptions: {
            ecmaVersion: "latest",
            sourceType: "module",
            globals: {
                ...globals.browser,
                ...globals.node,
                supabase: "readonly",
                asanaLibrary: "writable",
                // Yoga App "Bridge" Globals
                loadCourses: "readonly",
                setupBrowseUI: "readonly",
                updateDialUI: "readonly",
                currentSequence: "readonly",
                setPose: "readonly",
                stopTimer: "readonly",
                toggleHistoryPanel: "readonly"
            }
        },
        rules: {
            "check-file/filename-naming-convention": [
                "error",
                { "**/!(*.test).js": "CAMEL_CASE", "**/*.cjs": "SNAKE_CASE" }
            ],
            "no-unused-vars": ["warn", { "argsIgnorePattern": "^_", "varsIgnorePattern": "^_" }],
            "no-undef": "error",
            "no-empty": "warn",
            "no-useless-escape": "off",
            "no-constant-binary-expression": "error",
            "no-useless-assignment": "warn"
        }
    }
];