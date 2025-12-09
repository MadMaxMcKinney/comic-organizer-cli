import path from "path";
import ora from "ora";
import { logger } from "../utils/logger.js";
import { findComicFiles, getFilename, moveFile, readJsonFile, fileExists } from "../utils/files.js";

/**
 * Filter configuration structure:
 * {
 *   "filters": [
 *     {
 *       "name": "Marvel Comics",
 *       "pattern": "marvel|avengers|spider-man|x-men",
 *       "filters": [
 *         { "name": "Spider-Man", "pattern": "spider-man" },
 *         { "name": "X-Men", "pattern": "x-men" }
 *       ]
 *     }
 *   ]
 * }
 */

/**
 * Apply a single filter to a list of files
 */
function applyFilter(files, filter) {
    const regex = new RegExp(filter.pattern, "i");
    return files.filter((file) => regex.test(getFilename(file)));
}

/**
 * Recursively process filters and collect file assignments
 */
function processFilters(files, filters, parentPath = "") {
    const assignments = [];
    const assigned = new Set();

    for (const filter of filters) {
        const currentPath = parentPath ? `${parentPath}/${filter.name}` : filter.name;
        const matchedFiles = applyFilter(files, filter);

        if (filter.filters && filter.filters.length > 0) {
            // Process sub-filters first
            const subAssignments = processFilters(matchedFiles, filter.filters, currentPath);

            // Add sub-assignments
            for (const assignment of subAssignments.assignments) {
                assignments.push(assignment);
                assigned.add(assignment.file);
            }

            // Files matched by parent but not by any sub-filter go to parent folder
            const unassignedMatches = matchedFiles.filter((f) => !assigned.has(f));
            for (const file of unassignedMatches) {
                assignments.push({ file, folder: currentPath });
                assigned.add(file);
            }
        } else {
            // Leaf filter - assign directly
            for (const file of matchedFiles) {
                if (!assigned.has(file)) {
                    assignments.push({ file, folder: currentPath });
                    assigned.add(file);
                }
            }
        }
    }

    return { assignments, assigned };
}

/**
 * Validate filter configuration
 */
function validateConfig(config) {
    const errors = [];

    if (!config.filters || !Array.isArray(config.filters)) {
        errors.push('Configuration must have a "filters" array');
        return errors;
    }

    function validateFilter(filter, path = "") {
        const filterPath = path ? `${path}.${filter.name}` : filter.name;

        if (!filter.name || typeof filter.name !== "string") {
            errors.push(`Filter at ${filterPath || "root"} must have a "name" string`);
        }

        if (!filter.pattern || typeof filter.pattern !== "string") {
            errors.push(`Filter "${filterPath}" must have a "pattern" string`);
        } else {
            try {
                new RegExp(filter.pattern);
            } catch (e) {
                errors.push(`Filter "${filterPath}" has invalid regex pattern: ${e.message}`);
            }
        }

        if (filter.filters && Array.isArray(filter.filters)) {
            for (const subFilter of filter.filters) {
                validateFilter(subFilter, filterPath);
            }
        }
    }

    for (const filter of config.filters) {
        validateFilter(filter);
    }

    return errors;
}

/**
 * Load and validate filter configuration
 */
export async function loadFilterConfig(configPath) {
    if (!(await fileExists(configPath))) {
        throw new Error(`Configuration file not found: ${configPath}`);
    }

    const config = await readJsonFile(configPath);
    const errors = validateConfig(config);

    if (errors.length > 0) {
        throw new Error(`Invalid configuration:\n  - ${errors.join("\n  - ")}`);
    }

    return config;
}

/**
 * Manual organization using JSON filter configuration
 */
export async function runManualOrganizer(sourceDir, outputDir, configPath, options = {}) {
    const { dryRun = false, includeUnmatched = false, unmatchedFolder = "_Unmatched" } = options;

    // Load configuration
    logger.section("Loading filter configuration");

    const config = await loadFilterConfig(configPath);

    const filterCount = countFilters(config.filters);
    logger.success(`Loaded ${filterCount} filters from configuration`);

    // Show filter tree
    logger.newline();
    logger.info("Filter structure:");
    printFilterTree(config.filters);

    // Find files
    logger.section("Scanning for comic files");

    const spinner = ora("Finding comic files...").start();
    const files = await findComicFiles(sourceDir);
    spinner.succeed(`Found ${files.length} comic files`);

    if (files.length === 0) {
        logger.warning("No comic files found in the specified directory");
        return { processed: 0, moved: 0, unmatched: 0, errors: [] };
    }

    // Apply filters
    logger.section("Applying filters");

    const { assignments, assigned } = processFilters(files, config.filters);
    const unmatchedFiles = files.filter((f) => !assigned.has(f));

    logger.success(`Matched ${assignments.length} files to ${new Set(assignments.map((a) => a.folder)).size} folders`);

    if (unmatchedFiles.length > 0) {
        logger.warning(`${unmatchedFiles.length} files did not match any filter`);
        if (includeUnmatched) {
            logger.info(`Unmatched files will be moved to "${unmatchedFolder}"`);
            for (const file of unmatchedFiles) {
                assignments.push({ file, folder: unmatchedFolder });
            }
        }
    }

    // Group for display
    const groups = {};
    for (const { file, folder } of assignments) {
        if (!groups[folder]) groups[folder] = [];
        groups[folder].push(file);
    }

    logger.section("Organization Plan");

    for (const [folder, folderFiles] of Object.entries(groups)) {
        logger.folder(folder, folderFiles.length);
        folderFiles.slice(0, 3).forEach((f) => logger.file(getFilename(f)));
        if (folderFiles.length > 3) {
            logger.info(`    ... and ${folderFiles.length - 3} more`);
        }
    }

    if (unmatchedFiles.length > 0 && !includeUnmatched) {
        logger.newline();
        logger.warning("Unmatched files (will remain in source):");
        unmatchedFiles.slice(0, 5).forEach((f) => logger.file(getFilename(f)));
        if (unmatchedFiles.length > 5) {
            logger.info(`  ... and ${unmatchedFiles.length - 5} more`);
        }
    }

    if (dryRun) {
        logger.newline();
        logger.warning("DRY RUN - No files will be moved");
        logger.newline();

        for (const { file, folder } of assignments) {
            const destPath = path.join(outputDir, folder, getFilename(file));
            logger.preview(file, destPath);
        }

        return {
            processed: files.length,
            moved: 0,
            wouldMove: assignments.length,
            unmatched: unmatchedFiles.length,
            errors: [],
        };
    }

    // Execute moves
    logger.section("Moving files");

    const moveSpinner = ora("Moving files...").start();
    const errors = [];
    let moved = 0;

    for (const { file, folder } of assignments) {
        const destFolder = path.join(outputDir, folder);

        try {
            await moveFile(file, destFolder);
            moved++;
            moveSpinner.text = `Moved ${moved}/${assignments.length} files`;
        } catch (error) {
            errors.push({
                file,
                error: error.message,
            });
        }
    }

    if (errors.length === 0) {
        moveSpinner.succeed(`Successfully moved ${moved} files`);
    } else {
        moveSpinner.warn(`Moved ${moved} files with ${errors.length} errors`);
    }

    // Summary
    logger.section("Summary");
    logger.stats("Total files", files.length);
    logger.stats("Files moved", moved);
    logger.stats("Folders created", Object.keys(groups).length);
    logger.stats("Unmatched", unmatchedFiles.length);

    if (errors.length > 0) {
        logger.stats("Errors", errors.length);
        logger.newline();
        logger.error("Files with errors:");
        errors.forEach((e) => logger.file(e.file, e.error));
    }

    return { processed: files.length, moved, unmatched: unmatchedFiles.length, errors };
}

/**
 * Count total filters including nested
 */
function countFilters(filters) {
    let count = filters.length;
    for (const filter of filters) {
        if (filter.filters) {
            count += countFilters(filter.filters);
        }
    }
    return count;
}

/**
 * Print filter tree for display
 */
function printFilterTree(filters, indent = 0) {
    const prefix = "  ".repeat(indent);
    for (const filter of filters) {
        console.log(`${prefix}  📂 ${filter.name} (/${filter.pattern}/)`);
        if (filter.filters && filter.filters.length > 0) {
            printFilterTree(filter.filters, indent + 1);
        }
    }
}
