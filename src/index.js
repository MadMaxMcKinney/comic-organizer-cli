#!/usr/bin/env node

import { runCLI } from "./cli.js";

console.clear();

runCLI().catch((error) => {
    console.error("Fatal error:", error.message);
    process.exit(1);
});
