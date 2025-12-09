import path from "path";
import ora from "ora";
import { logger } from "../utils/logger.js";
import { findComicFiles, getFilename, moveFile } from "../utils/files.js";
import { batchGetMetadata, groupByFolder } from "../services/metadata.js";

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
        return { processed: 0, moved: 0, errors: [] };
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
    let processed = 0;

    const metadataResults = await batchGetMetadata(
        files.map((f) => getFilename(f)),
        {
            useApi,
            onProgress: (current, total, meta) => {
                processed = current;
                analyzeSpinner.text = `Analyzing ${current}/${total}: ${meta.cleanedName}`;
            },
        }
    );

    analyzeSpinner.succeed(`Analyzed ${metadataResults.length} files`);

    // Group by folder
    const groups = groupByFolder(metadataResults);
    const folderCount = Object.keys(groups).length;

    logger.section(`Organization Plan (${folderCount} folders)`);

    // Show organization preview
    for (const [folder, items] of Object.entries(groups)) {
        logger.folder(folder, items.length);
        items.slice(0, 3).forEach((item) => {
            logger.file(item.originalFilename, item.confidence);
        });
        if (items.length > 3) {
            logger.info(`    ... and ${items.length - 3} more`);
        }
    }

    if (dryRun) {
        logger.newline();
        logger.warning("DRY RUN - No files have been moved");
        logger.newline();

        // Show what would happen
        for (const [folder, items] of Object.entries(groups)) {
            for (const item of items) {
                const sourceIndex = metadataResults.indexOf(item);
                const sourcePath = files[sourceIndex];
                const destPath = path.join(outputDir, folder, item.originalFilename);
                logger.preview(sourcePath, destPath);
            }
        }

        return {
            processed: files.length,
            moved: 0,
            wouldMove: files.length,
            errors: [],
        };
    }

    // Execute moves
    logger.section("Moving files");

    const moveSpinner = ora("Moving files...").start();
    const errors = [];
    let moved = 0;

    for (const [folder, items] of Object.entries(groups)) {
        for (const item of items) {
            const sourceIndex = metadataResults.indexOf(item);
            const sourcePath = files[sourceIndex];
            const destFolder = path.join(outputDir, folder);

            try {
                await moveFile(sourcePath, destFolder);
                moved++;
                moveSpinner.text = `Moved ${moved}/${files.length} files`;
            } catch (error) {
                errors.push({
                    file: sourcePath,
                    error: error.message,
                });
            }
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
    logger.stats("Folders created", folderCount);

    if (errors.length > 0) {
        logger.stats("Errors", errors.length);
        logger.newline();
        logger.error("Files with errors:");
        errors.forEach((e) => logger.file(e.file, e.error));
    }

    return { processed: files.length, moved, errors };
}
