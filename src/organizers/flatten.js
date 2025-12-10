import path from "path";
import ora from "ora";
import fs from "fs-extra";
import inquirer from "inquirer";
import { logger } from "../utils/logger.js";
import { findComicFiles, getFilename } from "../utils/files.js";

/**
 * Find all subdirectories in a directory (recursively)
 */
async function findSubdirectories(directory) {
    const subdirs = [];

    async function walk(dir) {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.isDirectory()) {
                const fullPath = path.join(dir, entry.name);
                subdirs.push(fullPath);
                await walk(fullPath);
            }
        }
    }

    await walk(directory);
    return subdirs;
}

/**
 * Remove empty directories recursively (deepest first)
 */
async function removeEmptyDirectories(directories) {
    // Sort by depth (deepest first) to remove nested dirs before parents
    const sorted = directories.sort((a, b) => b.split(path.sep).length - a.split(path.sep).length);

    let removed = 0;
    for (const dir of sorted) {
        try {
            const entries = await fs.readdir(dir);
            if (entries.length === 0) {
                await fs.rmdir(dir);
                removed++;
            }
        } catch (error) {
            // Directory might already be removed or not empty
        }
    }
    return removed;
}

/**
 * Flatten hierarchy - move all comics to root folder
 */
export async function runFlattenOrganizer(sourceDir, options = {}) {
    const { dryRun = false } = options;

    logger.section("Scanning for comic files");

    const spinner = ora("Finding comic files in all subdirectories...").start();
    const allFiles = await findComicFiles(sourceDir, { recursive: true });
    spinner.succeed(`Found ${allFiles.length} comic files`);

    // Separate files already in root from files in subdirectories
    const filesInSubdirs = allFiles.filter((f) => path.dirname(f) !== sourceDir);
    const filesInRoot = allFiles.filter((f) => path.dirname(f) === sourceDir);

    logger.newline();
    logger.stats("Files already in root", filesInRoot.length);
    logger.stats("Files in subdirectories", filesInSubdirs.length);

    if (filesInSubdirs.length === 0) {
        logger.newline();
        logger.warning("No files found in subdirectories. Nothing to flatten.");
        return { processed: 0, moved: 0, foldersRemoved: 0, errors: [] };
    }

    // Find all subdirectories
    const subdirs = await findSubdirectories(sourceDir);
    logger.stats("Subdirectories found", subdirs.length);

    // Show preview of what will happen
    logger.section("Flatten Preview");

    // Group files by their current directory for display
    const byDir = {};
    for (const file of filesInSubdirs) {
        const dir = path.dirname(file);
        const relativeDir = path.relative(sourceDir, dir);
        if (!byDir[relativeDir]) byDir[relativeDir] = [];
        byDir[relativeDir].push(file);
    }

    for (const [dir, files] of Object.entries(byDir)) {
        logger.folder(dir, files.length);
        files.slice(0, 2).forEach((f) => logger.file(getFilename(f)));
        if (files.length > 2) {
            logger.info(`    ... and ${files.length - 2} more`);
        }
    }

    logger.newline();
    logger.info(`All ${filesInSubdirs.length} files will be moved to: ${sourceDir}`);
    logger.info(`${subdirs.length} empty folders will be removed after flattening.`);

    // Check for potential filename conflicts
    const conflicts = [];
    const existingFilenames = new Set(filesInRoot.map((f) => getFilename(f)));
    for (const file of filesInSubdirs) {
        const filename = getFilename(file);
        if (existingFilenames.has(filename)) {
            conflicts.push(filename);
        }
        existingFilenames.add(filename);
    }

    if (conflicts.length > 0) {
        logger.newline();
        logger.warning(`${conflicts.length} filename conflicts detected. Files will be renamed:`);
        conflicts.slice(0, 5).forEach((name) => logger.file(name, "will be renamed"));
        if (conflicts.length > 5) {
            logger.info(`    ... and ${conflicts.length - 5} more`);
        }
    }

    if (dryRun) {
        logger.newline();
        logger.warning("PREVIEW - No files have been moved");
        logger.newline();

        // Show what would happen
        for (const file of filesInSubdirs.slice(0, 10)) {
            const destPath = path.join(sourceDir, getFilename(file));
            logger.preview(file, destPath);
        }
        if (filesInSubdirs.length > 10) {
            logger.info(`  ... and ${filesInSubdirs.length - 10} more files`);
        }

        return {
            processed: allFiles.length,
            moved: 0,
            wouldMove: filesInSubdirs.length,
            foldersToRemove: subdirs.length,
            errors: [],
            filesInSubdirs,
            subdirs,
        };
    }

    // Execute flattening
    logger.section("Moving files to root");

    const moveSpinner = ora("Moving files...").start();
    const errors = [];
    let moved = 0;

    for (const file of filesInSubdirs) {
        const filename = getFilename(file);
        let destPath = path.join(sourceDir, filename);

        // Handle filename conflicts
        if ((await fs.pathExists(destPath)) && file !== destPath) {
            const ext = path.extname(filename);
            const base = path.basename(filename, ext);
            let counter = 1;
            while (await fs.pathExists(destPath)) {
                destPath = path.join(sourceDir, `${base}_${counter}${ext}`);
                counter++;
            }
        }

        try {
            await fs.move(file, destPath);
            moved++;
            moveSpinner.text = `Moved ${moved}/${filesInSubdirs.length} files`;
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

    // Remove empty directories
    logger.section("Removing empty folders");

    const removeSpinner = ora("Removing empty folders...").start();
    const foldersRemoved = await removeEmptyDirectories(subdirs);
    removeSpinner.succeed(`Removed ${foldersRemoved} empty folders`);

    // Show summary
    logger.section("Summary");
    logger.stats("Files moved to root", moved);
    logger.stats("Folders removed", foldersRemoved);

    if (errors.length > 0) {
        logger.stats("Errors", errors.length);
        logger.newline();
        logger.error("Files with errors:");
        errors.forEach((e) => logger.file(e.file, e.error));
    }

    return { processed: allFiles.length, moved, foldersRemoved, errors };
}
