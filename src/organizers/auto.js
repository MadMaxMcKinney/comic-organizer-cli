import path from "path";
import ora from "ora";
import { logger } from "../utils/logger.js";
import { findComicFiles, getFilename, moveFile } from "../utils/files.js";
import { batchGetMetadata } from "../services/metadata.js";
import { runConsolidation } from "./consolidate.js";

/**
 * Build assignments from metadata results
 */
function buildAssignments(files, metadataResults) {
    return files.map((file, index) => ({
        file,
        folder: metadataResults[index].suggestedFolder,
        metadata: metadataResults[index],
    }));
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
 * Simplify folders for single files
 * If a folder only has 1 file and has a nested path (Publisher/Title),
 * simplify to just the publisher folder
 */
function simplifySingleFileAssignments(assignments) {
    // Group by folder to find single-file folders
    const groups = groupAssignments(assignments);

    return assignments.map((assignment) => {
        const folderFiles = groups[assignment.folder];
        const pathParts = assignment.folder.split("/");

        // Only simplify if:
        // 1. This folder has exactly 1 file
        // 2. The path has more than 1 segment (e.g., Publisher/Title)
        // 3. The first segment isn't "Unsorted"
        if (folderFiles.length === 1 && pathParts.length > 1 && pathParts[0] !== "Unsorted") {
            return {
                ...assignment,
                folder: pathParts[0], // Just use the publisher folder
                simplified: true,
            };
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
    const { dryRun = false, useApi = true, skipConsolidation = false } = options;

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

    // Analyze files
    logger.section("Analyzing files for metadata");

    const analyzeSpinner = ora("Looking up metadata...").start();

    const metadataResults = await batchGetMetadata(
        files.map((f) => getFilename(f)),
        {
            useApi,
            onProgress: (current, total, meta) => {
                analyzeSpinner.text = `Analyzing ${current}/${total}: ${meta.cleanedName}`;
            },
        }
    );

    analyzeSpinner.succeed(`Analyzed ${metadataResults.length} files`);

    // Build assignments
    let assignments = buildAssignments(files, metadataResults);

    // Simplify single-file folders (put directly in publisher folder)
    assignments = simplifySingleFileAssignments(assignments);

    // Show initial plan
    let groups = groupAssignments(assignments);
    showOrganizationPlan(groups);

    // Offer consolidation if not skipped
    // Run if: multiple folders OR single folder with multiple files (for within-folder grouping)
    const totalFiles = assignments.length;
    const folderCount = Object.keys(groups).length;
    if (!skipConsolidation && (folderCount > 1 || totalFiles > 1)) {
        assignments = await runConsolidation(assignments);
        groups = groupAssignments(assignments);

        // Show updated plan if consolidation happened
        const wasConsolidated = assignments.some((a) => a.consolidated);
        if (wasConsolidated) {
            showOrganizationPlan(groups);
        }
    }

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
