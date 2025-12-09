import inquirer from "inquirer";
import chalk from "chalk";
import path from "path";
import fs from "fs-extra";
import ora from "ora";
import { logger } from "../utils/logger.js";
import { findComicFiles, getFilename } from "../utils/files.js";

/**
 * Normalize a string for comparison (lowercase, remove special chars, collapse spaces)
 */
function normalizeForComparison(str) {
    return str
        .toLowerCase()
        .replace(/['']/g, "") // Remove apostrophes
        .replace(/[-_:,\.]/g, " ") // Replace punctuation with spaces
        .replace(/\s+/g, " ") // Collapse multiple spaces
        .trim();
}

/**
 * Extract series name from folder path
 */
function extractSeriesFromFolder(folderPath) {
    const parts = folderPath.split("/");
    const lastPart = parts[parts.length - 1];

    // Remove volume/issue patterns
    const patterns = [/^(.+?)(?:\s+[Vv]\d+)/i, /^(.+?)(?:\s+\d{3,})/i, /^(.+?)(?:\s+#\d+)/i, /^(.+?)(?:\s*\(\d{4}\))/i];

    for (const pattern of patterns) {
        const match = lastPart.match(pattern);
        if (match && match[1]) {
            return match[1].trim();
        }
    }

    return lastPart;
}

/**
 * Calculate similarity between two folder names
 */
function calculateSimilarity(str1, str2) {
    const norm1 = normalizeForComparison(str1);
    const norm2 = normalizeForComparison(str2);

    // Exact match after normalization
    if (norm1 === norm2) return 1.0;

    // Check if one contains the other
    if (norm1.includes(norm2) || norm2.includes(norm1)) {
        const shorter = norm1.length < norm2.length ? norm1 : norm2;
        const longer = norm1.length < norm2.length ? norm2 : norm1;
        return shorter.length / longer.length;
    }

    // Word overlap
    const words1 = new Set(norm1.split(" ").filter((w) => w.length > 2));
    const words2 = new Set(norm2.split(" ").filter((w) => w.length > 2));

    if (words1.size === 0 || words2.size === 0) return 0;

    let overlap = 0;
    for (const word of words1) {
        if (words2.has(word)) overlap++;
    }

    return overlap / Math.max(words1.size, words2.size);
}

/**
 * Find all folders in a directory
 */
async function findFolders(directory) {
    const folders = new Set();
    const files = await findComicFiles(directory);

    for (const file of files) {
        const relativePath = path.relative(directory, path.dirname(file));
        if (relativePath && relativePath !== ".") {
            folders.add(relativePath);
        }
    }

    return Array.from(folders);
}

/**
 * Find similar folders that could be merged
 */
function findSimilarFolders(folders) {
    const SIMILARITY_THRESHOLD = 0.7;
    const processed = new Set();
    const groups = [];

    // Extract info for each folder
    const folderInfo = folders.map((folder) => {
        const parts = folder.split("/");
        const publisher = parts.length > 1 ? parts[0] : null;
        const seriesName = extractSeriesFromFolder(folder);
        const normalizedSeries = normalizeForComparison(seriesName);
        return { folder, publisher, seriesName, normalizedSeries };
    });

    // Group similar folders
    for (let i = 0; i < folderInfo.length; i++) {
        if (processed.has(i)) continue;

        const current = folderInfo[i];
        const group = {
            seriesName: current.seriesName,
            publisher: current.publisher,
            suggestedFolder: current.folder,
            folders: [current.folder],
        };

        processed.add(i);

        // Find similar folders
        for (let j = i + 1; j < folderInfo.length; j++) {
            if (processed.has(j)) continue;

            const other = folderInfo[j];

            // Must have same publisher (or both no publisher)
            if (current.publisher !== other.publisher) continue;

            // Check similarity
            const similarity = calculateSimilarity(current.seriesName, other.seriesName);

            if (similarity >= SIMILARITY_THRESHOLD) {
                group.folders.push(other.folder);
                processed.add(j);

                // Use shorter series name as the group name
                if (other.seriesName.length < group.seriesName.length) {
                    group.seriesName = other.seriesName;
                    group.suggestedFolder = other.folder;
                }
            }
        }

        // Only keep groups with multiple folders
        if (group.folders.length > 1) {
            groups.push(group);
        }
    }

    // Sort by number of folders (most first)
    groups.sort((a, b) => b.folders.length - a.folders.length);

    return groups;
}

/**
 * Consolidate folders post-processor
 */
export async function consolidateFoldersHandler(sourceDir, outputDir) {
    logger.newline();
    const spinner = ora("Scanning for similar folders...").start();

    const folders = await findFolders(outputDir);

    if (folders.length === 0) {
        spinner.warn("No folders found");
        return;
    }

    const similarGroups = findSimilarFolders(folders);

    if (similarGroups.length === 0) {
        spinner.info("No similar folders found to consolidate");
        return;
    }

    spinner.succeed(`Found ${similarGroups.length} groups of similar folders`);
    logger.newline();

    // Show groups
    logger.info("Similar folders that could be merged:\n");
    for (let i = 0; i < similarGroups.length; i++) {
        const group = similarGroups[i];
        console.log(chalk.yellow(`  ${i + 1}. ${group.seriesName}`) + chalk.dim(` (${group.folders.length} folders)`));
        for (const folder of group.folders) {
            console.log(chalk.gray(`      • ${folder}`));
        }
        console.log();
    }

    const { wantConsolidate } = await inquirer.prompt([
        {
            type: "confirm",
            name: "wantConsolidate",
            message: "Would you like to merge any of these folders?",
            default: true,
        },
    ]);

    if (!wantConsolidate) {
        return;
    }

    // Let user select which groups to consolidate
    const { selectedGroups } = await inquirer.prompt([
        {
            type: "checkbox",
            name: "selectedGroups",
            message: "Select folder groups to merge:",
            choices: similarGroups.map((group, index) => ({
                name: `${group.seriesName} (merge ${group.folders.length} folders)`,
                value: index,
                checked: true,
            })),
        },
    ]);

    // Process each selected group
    for (const groupIndex of selectedGroups) {
        const group = similarGroups[groupIndex];

        logger.newline();
        logger.info(`Merging: ${chalk.cyan(group.seriesName)}`);
        console.log(chalk.dim(`  ${group.folders.length} folders`));
        logger.newline();

        // Ask for target folder name
        const { targetFolder } = await inquirer.prompt([
            {
                type: "input",
                name: "targetFolder",
                message: `Choose target folder name:`,
                default: group.suggestedFolder,
            },
        ]);

        const targetPath = path.join(outputDir, targetFolder);

        // Move files from all source folders to target
        const mergeSpinner = ora(`Merging folders into ${targetFolder}...`).start();
        let filesMoved = 0;
        let errors = 0;

        for (const sourceFolder of group.folders) {
            if (sourceFolder === targetFolder) continue; // Skip if already the target

            const sourcePath = path.join(outputDir, sourceFolder);
            const files = await findComicFiles(sourcePath);

            for (const file of files) {
                const filename = path.basename(file);
                const destPath = path.join(targetPath, filename);

                try {
                    await fs.ensureDir(targetPath);
                    await fs.move(file, destPath, { overwrite: false });
                    filesMoved++;
                } catch (error) {
                    errors++;
                }
            }

            // Remove empty source folder
            try {
                const entries = await fs.readdir(sourcePath);
                if (entries.length === 0) {
                    await fs.rmdir(sourcePath);
                }
            } catch {
                // Folder not empty or doesn't exist
            }
        }

        if (errors > 0) {
            mergeSpinner.warn(`Merged ${filesMoved} files (${errors} errors)`);
        } else {
            mergeSpinner.succeed(`Merged ${filesMoved} files into ${targetFolder}`);
        }
    }

    logger.newline();
    logger.success("Folder consolidation complete!");
}
