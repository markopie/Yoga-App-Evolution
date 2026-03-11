---
description: Starts the local server and launches the site in your browser
---

Here are the automatic steps to start the site:

// turbo-all
1. Use `run_command` to execute `npm start` in the background. Be sure to set WaitMsBeforeAsync to 2000 so the command runs asynchronously.
2. Use `run_command` to execute `Start-Process "http://localhost:3000"` to automatically open the site in the user's default browser. Set WaitMsBeforeAsync to 500.
