import path from "path";
import ora from "ora";
import inquirer from "inquirer";
import { logger } from "../utils/logger.js";
import { findComicFiles, getFilename, moveFile } from "../utils/files.js";
import { batchGetMetadata } from "../services/metadata.js";
import { detectSeriesGroups, createSeriesLookupMap, promptSeriesReview } from "../services/seriesDetection.js";
import { SERIES_PATTERNS } from "../patterns/seriesPatterns.js";

/**
 * Get publisher from series patterns if series matches
 */
function getPublisherFromPattern(text) {
    for (const { pattern, publisher } of SERIES_PATTERNS) {
        if (pattern.test(text)) {
            return publisher;
        }
    }
    return null;
}

/**
 * Build assignments from metadata results and series detection
 * Series detection takes priority - files in a series stay together
 * Publisher from series patterns takes priority over metadata
 */
function buildAssignments(files, metadataResults, seriesLookupMap, seriesGroups) {
    // First pass: determine the best publisher for each series by checking series name against patterns
    const seriesPublisherMap = new Map();

    for (const group of seriesGroups) {
        // Check if the series name matches a pattern - this takes priority
        const patternPublisher = getPublisherFromPattern(group.seriesName);

        if (patternPublisher) {
            // Series name matched a pattern, use that publisher
            seriesPublisherMap.set(group.seriesName, patternPublisher);
        } else {
            // Fall back to counting publishers from metadata
            const publishers = new Map(); // publisher -> count

            // Count publishers for files in this series
            for (const file of group.files) {
                const fileIndex = files.indexOf(file);
                if (fileIndex !== -1) {
                    const metadata = metadataResults[fileIndex];
                    if (metadata.publisher) {
                        publishers.set(metadata.publisher, (publishers.get(metadata.publisher) || 0) + 1);
                    }
                }
            }

            // Use the most common publisher for this series
            if (publishers.size > 0) {
                const mostCommonPublisher = Array.from(publishers.entries()).sort((a, b) => b[1] - a[1])[0][0];
                seriesPublisherMap.set(group.seriesName, mostCommonPublisher);
            }
        }
    }

    return files.map((file, index) => {
        const metadata = metadataResults[index];
        const detectedSeries = seriesLookupMap.get(file);
        const filename = getFilename(file);

        // If we detected a series for this file, use it to build a better folder path
        let folder = metadata.suggestedFolder;
        let patternPublisher = null;

        if (detectedSeries) {
            // Use the series-level publisher (already includes pattern check from above)
            const publisherToUse = seriesPublisherMap.get(detectedSeries);

            if (publisherToUse) {
                // Use determined publisher with the series name
                folder = `${publisherToUse}/${detectedSeries}`;
                patternPublisher = publisherToUse;
            } else if (metadata.publisher) {
                // Fallback to file's own publisher if no series publisher
                folder = `${metadata.publisher}/${detectedSeries}`;
            } else {
                // Use detected series name without publisher
                folder = detectedSeries;
            }
        } else {
            // Single file - check if it matches a pattern
            patternPublisher = getPublisherFromPattern(filename);

            if (patternPublisher) {
                // Single file with pattern match - use pattern publisher
                const seriesName = metadata.series || metadata.cleanedName;
                folder = `${patternPublisher}/${seriesName}`;
            }
        }

        return {
            file,
            folder,
            metadata,
            detectedSeries,
            patternPublisher,
        };
    });
}

/**
 * Group assignments by folder for display
 */
function groupAssignments(assignments) {
    const groups = {};
    for (const assignment of assignments) {
        if (!groups[assignment.folder]) {
            groups[assignment.folder] = [];
        }
        groups[assignment.folder].push(assignment);
    }
    return groups;
}

/**
 * Prompt user for how they want to handle single files (oneshots)
 */
async function promptSingleFileHandling(singleFileCount) {
    logger.newline();
    logger.section("Single Files Detected");
    logger.info(`Found ${singleFileCount} file(s) that don't have other files in their series.\n`);

    const { handling } = await inquirer.prompt([
        {
            type: "list",
            name: "handling",
            message: "How would you like to handle single files?",
            choices: [
                {
                    name: "Create individual series folders for each based on metadata",
                    value: "series-folder",
                },
                {
                    name: 'Move all to a single "oneshots" folder',
                    value: "oneshots",
                },
                {
                    name: "Leave as-is (in publisher folders only)",
                    value: "as-is",
                },
            ],
            default: "oneshots",
        },
    ]);

    return handling;
}

/**
 * Apply single file handling preference to assignments
 */
function applySingleFileHandling(assignments, seriesLookupMap, handlingChoice) {
    return assignments.map((assignment) => {
        const isInSeries = seriesLookupMap.has(assignment.file);

        // Only modify single files (not part of a detected series)
        if (!isInSeries) {
            const pathParts = assignment.folder.split("/");

            switch (handlingChoice) {
                case "oneshots":
                    // Move to oneshots folder (preserve publisher if exists)
                    if (pathParts[0] !== "Unsorted" && pathParts.length > 1) {
                        return {
                            ...assignment,
                            folder: `${pathParts[0]}/oneshots`,
                            oneshotHandling: true,
                        };
                    } else {
                        return {
                            ...assignment,
                            folder: "oneshots",
                            oneshotHandling: true,
                        };
                    }

                case "as-is":
                    // Simplify to just publisher folder
                    if (pathParts.length > 1 && pathParts[0] !== "Unsorted") {
                        return {
                            ...assignment,
                            folder: pathParts[0],
                            simplified: true,
                        };
                    }
                    return assignment;

                case "series-folder":
                default:
                    // Keep the full path (Publisher/Series)
                    return assignment;
            }
        }

        return assignment;
    });
}

/**
 * Show organization plan
 */
function showOrganizationPlan(groups) {
    const folderCount = Object.keys(groups).length;
    logger.section(`Organization Plan (${folderCount} folders)`);

    for (const [folder, items] of Object.entries(groups)) {
        logger.folder(folder, items.length);
        items.slice(0, 3).forEach((item) => {
            logger.file(getFilename(item.file), item.metadata?.confidence || "");
        });
        if (items.length > 3) {
            logger.info(`    ... and ${items.length - 3} more`);
        }
    }
}

/**
 * Execute moves for pre-computed assignments (used after preview confirmation)
 */
export async function executeAssignments(assignments, outputDir) {
    logger.section("Moving files");

    const moveSpinner = ora("Moving files...").start();
    const errors = [];
    let moved = 0;

    for (const assignment of assignments) {
        const destFolder = path.join(outputDir, assignment.folder);

        try {
            await moveFile(assignment.file, destFolder);
            moved++;
            moveSpinner.text = `Moved ${moved}/${assignments.length} files`;
        } catch (error) {
            errors.push({
                file: assignment.file,
                error: error.message,
            });
        }
    }

    if (errors.length === 0) {
        moveSpinner.succeed(`Successfully moved ${moved} files`);
    } else {
        moveSpinner.warn(`Moved ${moved} files with ${errors.length} errors`);
    }

    // Show summary
    const folders = new Set(assignments.map((a) => a.folder));
    logger.section("Summary");
    logger.stats("Total files", assignments.length);
    logger.stats("Files moved", moved);
    logger.stats("Folders created", folders.size);

    if (errors.length > 0) {
        logger.stats("Errors", errors.length);
        logger.newline();
        logger.error("Files with errors:");
        errors.forEach((e) => logger.file(e.file, e.error));
    }

    return { processed: assignments.length, moved, errors };
}

/**
 * Automated organization using metadata lookup
 */
export async function runAutoOrganizer(sourceDir, outputDir, options = {}) {
    const { dryRun = false, useApi = true } = options;

    logger.section("Scanning for comic files");

    const spinner = ora("Finding comic files...").start();
    const files = await findComicFiles(sourceDir);
    spinner.succeed(`Found ${files.length} comic files`);

    if (files.length === 0) {
        logger.warning("No comic files found in the specified directory");
        return { processed: 0, moved: 0, errors: [], assignments: [] };
    }

    // Show found files
    logger.newline();
    logger.info("Files found:");
    files.slice(0, 10).forEach((f) => logger.file(getFilename(f)));
    if (files.length > 10) {
        logger.info(`  ... and ${files.length - 10} more`);
    }

    // Detect series groups BEFORE metadata analysis
    logger.section("Detecting series from filenames");
    const seriesSpinner = ora("Analyzing filenames for series patterns...").start();
    let seriesGroups = detectSeriesGroups(files);

    if (seriesGroups.length > 0) {
        seriesSpinner.succeed(`Detected ${seriesGroups.length} series with multiple issues`);

        // Prompt user to review and optionally rename series
        seriesGroups = await promptSeriesReview(seriesGroups);
    } else {
        seriesSpinner.info("No series with multiple issues detected");
    }

    // Create lookup map after potential renames
    const seriesLookupMap = createSeriesLookupMap(seriesGroups);

    // Count single files (files not in any series)
    const singleFileCount = files.filter((file) => !seriesLookupMap.has(file)).length;
    let singleFileHandling = "series-folder"; // default

    // If there are single files, prompt user for handling preference
    if (singleFileCount > 0) {
        singleFileHandling = await promptSingleFileHandling(singleFileCount);
    }

    // Analyze files
    logger.section("Analyzing files for metadata");

    const analyzeSpinner = ora("Looking up metadata...").start();

    const metadataResults = await batchGetMetadata(files, {
        useApi,
        onProgress: (current, total, meta) => {
            analyzeSpinner.text = `Analyzing ${current}/${total}: ${meta.cleanedName}`;
        },
    });

    analyzeSpinner.succeed(`Analyzed ${metadataResults.length} files`);

    // Build assignments with series detection
    let assignments = buildAssignments(files, metadataResults, seriesLookupMap, seriesGroups);

    // Apply user's preference for handling single files
    assignments = applySingleFileHandling(assignments, seriesLookupMap, singleFileHandling);

    // Show organization plan
    let groups = groupAssignments(assignments);
    showOrganizationPlan(groups);

    if (dryRun) {
        logger.newline();
        logger.warning("PREVIEW - No files have been moved");
        logger.newline();

        // Show what would happen
        for (const [folder, items] of Object.entries(groups)) {
            for (const item of items) {
                const destPath = path.join(outputDir, folder, getFilename(item.file));
                logger.preview(item.file, destPath);
            }
        }

        return {
            processed: files.length,
            moved: 0,
            wouldMove: files.length,
            errors: [],
            assignments,
        };
    }

    // Execute moves
    logger.section("Moving files");

    const moveSpinner = ora("Moving files...").start();
    const errors = [];
    let moved = 0;

    for (const assignment of assignments) {
        const destFolder = path.join(outputDir, assignment.folder);

        try {
            await moveFile(assignment.file, destFolder);
            moved++;
            moveSpinner.text = `Moved ${moved}/${files.length} files`;
        } catch (error) {
            errors.push({
                file: assignment.file,
                error: error.message,
            });
        }
    }

    if (errors.length === 0) {
        moveSpinner.succeed(`Successfully moved ${moved} files`);
    } else {
        moveSpinner.warn(`Moved ${moved} files with ${errors.length} errors`);
    }

    // Show summary
    logger.section("Summary");
    logger.stats("Total files", files.length);
    logger.stats("Files moved", moved);
    logger.stats("Folders created", Object.keys(groups).length);

    if (errors.length > 0) {
        logger.stats("Errors", errors.length);
        logger.newline();
        logger.error("Files with errors:");
        errors.forEach((e) => logger.file(e.file, e.error));
    }

    return { processed: files.length, moved, errors, assignments };
}
