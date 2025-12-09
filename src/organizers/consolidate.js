import inquirer from "inquirer";
import chalk from "chalk";
import { logger } from "../utils/logger.js";
import { getFilename } from "../utils/files.js";

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
 * Extract potential series name from a string (folder path or filename)
 * More forgiving pattern matching
 */
function extractSeriesName(input, isFilename = false) {
    let name = isFilename ? input.replace(/\.[^.]+$/, "") : input.split("/").pop();

    // For filenames, also remove common filename patterns
    if (isFilename) {
        name = name
            .replace(/[-_]/g, " ") // Replace separators with spaces
            .replace(/\s+/g, " ") // Collapse spaces
            .trim();
    }

    // Common patterns to extract series name (order matters - most specific first)
    const patterns = [
        // "Hellboy: The Bride of Hell" -> "Hellboy"
        /^(.+?)(?:\s*:\s*)/i,
        // "Hellboy Volume 11" or "Hellboy Vol. 2" -> "Hellboy"
        /^(.+?)(?:\s+(?:Volume|Vol\.?|Book|Part|Chapter)\s*\d*)/i,
        // "hellboyvolume11" -> "hellboy" (no spaces version)
        /^([a-z]+?)(?:volume|vol|book|part|issue)/i,
        // "Hellboy #1" or "Hellboy Issue 5" -> "Hellboy"
        /^(.+?)(?:\s+(?:#|Issue|No\.?)\s*\d+)/i,
        // "Hellboy (2019)" -> "Hellboy"
        /^(.+?)(?:\s*\(\d{4}\))/i,
        // "Hellboy - Something" -> "Hellboy"
        /^(.+?)(?:\s*[-–—]\s*)/i,
        // "Hellboy 001" -> "Hellboy"
        /^(.+?)(?:\s+\d{2,})/i,
        // "hellboy001" or "hellboy 1" -> "hellboy" (for filenames)
        /^([a-z]+?)(?:\d+)/i,
        // Fallback: first word if multiple words
        /^(\w+)\s+/i,
    ];

    for (const pattern of patterns) {
        const match = name.match(pattern);
        if (match && match[1] && match[1].length > 2) {
            return match[1].trim();
        }
    }

    return name;
}

/**
 * Calculate similarity between two strings (simple word overlap)
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
 * Find common series across folders using fuzzy matching
 */
export function findPotentialGroups(folders) {
    const SIMILARITY_THRESHOLD = 0.6;
    const processed = new Set();
    const groups = [];

    // Extract series info for each folder
    const folderInfo = folders.map((folder) => {
        const parts = folder.split("/");
        const publisher = parts.length > 1 ? parts[0] : null;
        const seriesName = extractSeriesName(folder);
        const normalizedSeries = normalizeForComparison(seriesName);
        return { folder, publisher, seriesName, normalizedSeries };
    });

    // Group folders with similar series names
    for (let i = 0; i < folderInfo.length; i++) {
        if (processed.has(i)) continue;

        const current = folderInfo[i];
        const group = {
            seriesName: current.seriesName,
            publisher: current.publisher,
            suggestedFolder: current.publisher ? `${current.publisher}/${current.seriesName}` : current.seriesName,
            folders: [current.folder],
            folderIndices: [i],
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
                group.folderIndices.push(j);
                processed.add(j);

                // Use shorter series name as the group name (usually more accurate)
                if (other.seriesName.length < group.seriesName.length) {
                    group.seriesName = other.seriesName;
                    group.suggestedFolder = other.publisher ? `${other.publisher}/${other.seriesName}` : other.seriesName;
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
 * Find series groupings within files that share the same folder
 * This catches cases where multiple files were simplified to publisher-only folders
 */
export function findSeriesWithinFolders(assignments) {
    const SIMILARITY_THRESHOLD = 0.5;
    const groups = [];

    // Group assignments by folder first
    const byFolder = {};
    for (const assignment of assignments) {
        if (!byFolder[assignment.folder]) {
            byFolder[assignment.folder] = [];
        }
        byFolder[assignment.folder].push(assignment);
    }

    // For each folder with multiple files, look for series patterns
    for (const [folder, files] of Object.entries(byFolder)) {
        if (files.length < 2) continue;

        // Extract series name from each filename
        const fileInfo = files.map((assignment) => {
            const filename = getFilename(assignment.file);
            const seriesName = extractSeriesName(filename, true);
            const normalizedSeries = normalizeForComparison(seriesName);
            return { assignment, filename, seriesName, normalizedSeries };
        });

        // Group similar files within this folder
        const processed = new Set();
        for (let i = 0; i < fileInfo.length; i++) {
            if (processed.has(i)) continue;

            const current = fileInfo[i];
            const matchingFiles = [current];
            processed.add(i);

            // Find similar files
            for (let j = i + 1; j < fileInfo.length; j++) {
                if (processed.has(j)) continue;

                const other = fileInfo[j];
                const similarity = calculateSimilarity(current.seriesName, other.seriesName);

                if (similarity >= SIMILARITY_THRESHOLD) {
                    matchingFiles.push(other);
                    processed.add(j);
                }
            }

            // If we found multiple files with similar series names, create a group
            if (matchingFiles.length >= 2) {
                // Use the shortest series name
                const shortestName = matchingFiles.reduce((shortest, f) => (f.seriesName.length < shortest.length ? f.seriesName : shortest), matchingFiles[0].seriesName);

                // Capitalize first letter of each word
                const formattedName = shortestName
                    .split(" ")
                    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
                    .join(" ");

                groups.push({
                    seriesName: formattedName,
                    parentFolder: folder,
                    suggestedFolder: `${folder}/${formattedName}`,
                    files: matchingFiles.map((f) => f.assignment),
                    type: "within-folder",
                });
            }
        }
    }

    // Sort by file count (most first)
    groups.sort((a, b) => b.files.length - a.files.length);

    return groups;
}

/**
 * Apply consolidation to assignments
 * Remaps folder paths based on user-selected consolidations
 */
export function applyConsolidation(assignments, consolidations) {
    const fileExclusions = new Set();
    const folderRemap = new Map();
    const fileRemap = new Map(); // For within-folder consolidations

    for (const consolidation of consolidations) {
        const { originalFolders, newFolder, excludedFiles, includedFiles, type } = consolidation;

        // Track excluded files
        if (excludedFiles) {
            for (const file of excludedFiles) {
                fileExclusions.add(file);
            }
        }

        if (type === "within-folder") {
            // For within-folder consolidations, map specific files
            if (includedFiles) {
                for (const file of includedFiles) {
                    fileRemap.set(file, newFolder);
                }
            }
        } else {
            // For folder-based consolidations
            if (originalFolders) {
                for (const original of originalFolders) {
                    folderRemap.set(original, newFolder);
                }
            }
        }
    }

    return assignments.map((assignment) => {
        // Skip excluded files
        if (fileExclusions.has(assignment.file)) {
            return assignment;
        }

        // Check for file-specific remap first (within-folder consolidation)
        const fileNewFolder = fileRemap.get(assignment.file);
        if (fileNewFolder) {
            return { ...assignment, folder: fileNewFolder, consolidated: true };
        }

        // Check for folder-based remap
        const folderNewFolder = folderRemap.get(assignment.folder);
        if (folderNewFolder) {
            return { ...assignment, folder: folderNewFolder, consolidated: true };
        }

        return assignment;
    });
}

/**
 * Get all files that belong to a group's folders
 */
function getFilesForGroup(assignments, folders) {
    const folderSet = new Set(folders);
    return assignments.filter((a) => folderSet.has(a.folder));
}

/**
 * Interactive prompt to let users consolidate folders and select files
 * Handles both folder-based groups and within-folder series groups
 */
export async function promptConsolidation(folderGroups, withinFolderGroups, assignments) {
    const allGroups = [...folderGroups.map((g) => ({ ...g, type: "folder" })), ...withinFolderGroups.map((g) => ({ ...g, type: "within-folder" }))];

    if (allGroups.length === 0) {
        return [];
    }

    logger.section("Series Consolidation");

    // Show folder-based groups
    if (folderGroups.length > 0) {
        logger.info("Found similar folders that could be merged:\n");
        for (let i = 0; i < folderGroups.length; i++) {
            const group = folderGroups[i];
            const filesInGroup = getFilesForGroup(assignments, group.folders);
            console.log(chalk.yellow(`  ${i + 1}. ${group.seriesName}`) + chalk.dim(` (${group.folders.length} folders, ${filesInGroup.length} files)`));
            for (const folder of group.folders) {
                const folderFiles = assignments.filter((a) => a.folder === folder);
                console.log(chalk.gray(`      • ${folder}`) + chalk.dim(` (${folderFiles.length} files)`));
            }
            console.log();
        }
    }

    // Show within-folder series groups
    if (withinFolderGroups.length > 0) {
        logger.info("Found files within folders that could be grouped by series:\n");
        for (let i = 0; i < withinFolderGroups.length; i++) {
            const group = withinFolderGroups[i];
            console.log(chalk.cyan(`  ${folderGroups.length + i + 1}. ${group.seriesName}`) + chalk.dim(` (${group.files.length} files in ${group.parentFolder})`));
            for (const assignment of group.files.slice(0, 3)) {
                console.log(chalk.gray(`      • ${getFilename(assignment.file)}`));
            }
            if (group.files.length > 3) {
                console.log(chalk.gray(`      ... and ${group.files.length - 3} more`));
            }
            console.log();
        }
    }

    const { wantConsolidate } = await inquirer.prompt([
        {
            type: "confirm",
            name: "wantConsolidate",
            message: "Would you like to consolidate any of these into series folders?",
            default: true,
        },
    ]);

    if (!wantConsolidate) {
        return [];
    }

    const consolidations = [];

    // Build choices for selection
    const choices = [];
    for (let i = 0; i < folderGroups.length; i++) {
        const group = folderGroups[i];
        const filesInGroup = getFilesForGroup(assignments, group.folders);
        choices.push({
            name: `${group.seriesName} (merge ${group.folders.length} folders, ${filesInGroup.length} files)`,
            value: { index: i, type: "folder" },
            checked: true,
        });
    }
    for (let i = 0; i < withinFolderGroups.length; i++) {
        const group = withinFolderGroups[i];
        choices.push({
            name: `${group.seriesName} (create subfolder in ${group.parentFolder}, ${group.files.length} files)`,
            value: { index: i, type: "within-folder" },
            checked: true,
        });
    }

    // Let user select which groups to consolidate
    const { selectedGroups } = await inquirer.prompt([
        {
            type: "checkbox",
            name: "selectedGroups",
            message: "Select series to consolidate:",
            choices,
        },
    ]);

    // Process each selected group
    for (const { index, type } of selectedGroups) {
        if (type === "folder") {
            const group = folderGroups[index];
            const filesInGroup = getFilesForGroup(assignments, group.folders);

            // First, set the target folder
            const { targetFolder } = await inquirer.prompt([
                {
                    type: "input",
                    name: "targetFolder",
                    message: `Consolidate "${group.seriesName}" into folder:`,
                    default: group.suggestedFolder,
                },
            ]);

            // Then, let user select which files to include
            const { selectedFiles } = await inquirer.prompt([
                {
                    type: "checkbox",
                    name: "selectedFiles",
                    message: `Select files to include in "${targetFolder}":`,
                    choices: filesInGroup.map((assignment) => ({
                        name: `${getFilename(assignment.file)} ${chalk.dim(`(from ${assignment.folder})`)}`,
                        value: assignment.file,
                        checked: true,
                    })),
                    pageSize: 15,
                },
            ]);

            // Find excluded files
            const excludedFiles = filesInGroup.filter((a) => !selectedFiles.includes(a.file)).map((a) => a.file);

            consolidations.push({
                seriesName: group.seriesName,
                originalFolders: group.folders,
                newFolder: targetFolder,
                includedFiles: selectedFiles,
                excludedFiles: excludedFiles,
                type: "folder",
            });

            if (excludedFiles.length > 0) {
                logger.info(`  ${selectedFiles.length} files included, ${excludedFiles.length} excluded`);
            }
        } else {
            // within-folder type
            const group = withinFolderGroups[index];

            // Set the target folder
            const { targetFolder } = await inquirer.prompt([
                {
                    type: "input",
                    name: "targetFolder",
                    message: `Create subfolder for "${group.seriesName}" in ${group.parentFolder}:`,
                    default: group.suggestedFolder,
                },
            ]);

            // Let user select which files to include
            const { selectedFiles } = await inquirer.prompt([
                {
                    type: "checkbox",
                    name: "selectedFiles",
                    message: `Select files to include in "${targetFolder}":`,
                    choices: group.files.map((assignment) => ({
                        name: getFilename(assignment.file),
                        value: assignment.file,
                        checked: true,
                    })),
                    pageSize: 15,
                },
            ]);

            // Find excluded files
            const excludedFiles = group.files.filter((a) => !selectedFiles.includes(a.file)).map((a) => a.file);

            consolidations.push({
                seriesName: group.seriesName,
                parentFolder: group.parentFolder,
                newFolder: targetFolder,
                includedFiles: selectedFiles,
                excludedFiles: excludedFiles,
                type: "within-folder",
            });

            if (excludedFiles.length > 0) {
                logger.info(`  ${selectedFiles.length} files included, ${excludedFiles.length} excluded`);
            }
        }
    }

    return consolidations;
}

/**
 * Show consolidation summary
 */
export function showConsolidationSummary(consolidations) {
    if (consolidations.length === 0) {
        return;
    }

    logger.section("Consolidation Summary");

    for (const consolidation of consolidations) {
        const { seriesName, originalFolders, parentFolder, newFolder, includedFiles, excludedFiles, type } = consolidation;
        const included = includedFiles?.length || 0;
        const excluded = excludedFiles?.length || 0;

        console.log(chalk.green(`  ✔ ${seriesName}`) + chalk.dim(` → ${newFolder}`));

        if (type === "within-folder") {
            console.log(chalk.gray(`    ${included} files grouped from ${parentFolder}`));
        } else {
            const folderCount = originalFolders?.length || 0;
            console.log(chalk.gray(`    ${included} files from ${folderCount} folders`));
        }

        if (excluded > 0) {
            console.log(chalk.yellow(`    ${excluded} files excluded (kept in original location)`));
        }
    }

    logger.newline();
}

/**
 * Interactive flow to detect and apply folder consolidation
 */
export async function runConsolidation(assignments) {
    // Get unique folders
    const folders = [...new Set(assignments.map((a) => a.folder))];

    // Find folder-based groupings (similar folder names)
    const folderGroups = findPotentialGroups(folders);

    // Find within-folder series groupings (files in same folder with similar names)
    const withinFolderGroups = findSeriesWithinFolders(assignments);

    if (folderGroups.length === 0 && withinFolderGroups.length === 0) {
        logger.info("No similar folders or series found for consolidation.");
        return assignments;
    }

    // Prompt user with both types of groups
    const consolidations = await promptConsolidation(folderGroups, withinFolderGroups, assignments);

    if (consolidations.length === 0) {
        return assignments;
    }

    // Apply consolidations
    const consolidated = applyConsolidation(assignments, consolidations);

    // Show summary
    showConsolidationSummary(consolidations);

    return consolidated;
}
