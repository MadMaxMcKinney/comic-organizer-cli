import inquirer from "inquirer";
import chalk from "chalk";
import { logger } from "../utils/logger.js";

/**
 * Extract potential series name from a folder path
 * e.g., "Dark Horse Comics/Hellboy Volume 11: The Bride of Hell" -> "Hellboy"
 */
function extractSeriesName(folderPath) {
    const folderName = folderPath.split("/").pop();

    // Common patterns to extract series name
    const patterns = [
        /^(.+?)(?:\s*:|\s+Volume|\s+Vol\.?|\s+#|\s+Issue|\s*\()/i, // "Hellboy: Something" or "Hellboy Volume 1"
        /^(.+?)(?:\s+\d+)/i, // "Hellboy 1"
        /^(.+?)$/i, // Fallback: whole name
    ];

    for (const pattern of patterns) {
        const match = folderName.match(pattern);
        if (match && match[1]) {
            return match[1].trim();
        }
    }

    return folderName;
}

/**
 * Find common series across folders
 * Returns groups of folders that share a common series name
 */
export function findPotentialGroups(folders) {
    const seriesMap = new Map();

    for (const folder of folders) {
        const parts = folder.split("/");
        const publisher = parts.length > 1 ? parts[0] : null;
        const seriesName = extractSeriesName(folder);

        // Create a key combining publisher and series
        const key = publisher ? `${publisher}/${seriesName}` : seriesName;

        if (!seriesMap.has(key)) {
            seriesMap.set(key, {
                seriesName,
                publisher,
                suggestedFolder: key,
                folders: [],
            });
        }
        seriesMap.get(key).folders.push(folder);
    }

    // Only return groups with more than one folder
    const groups = [];
    for (const [key, group] of seriesMap) {
        if (group.folders.length > 1) {
            groups.push(group);
        }
    }

    // Sort by number of folders (most first)
    groups.sort((a, b) => b.folders.length - a.folders.length);

    return groups;
}

/**
 * Apply consolidation to assignments
 * Remaps folder paths based on user-selected consolidations
 */
export function applyConsolidation(assignments, consolidations) {
    const folderRemap = new Map();

    for (const { originalFolders, newFolder } of consolidations) {
        for (const original of originalFolders) {
            folderRemap.set(original, newFolder);
        }
    }

    return assignments.map((assignment) => {
        const newFolder = folderRemap.get(assignment.folder);
        if (newFolder) {
            return { ...assignment, folder: newFolder, consolidated: true };
        }
        return assignment;
    });
}

/**
 * Interactive prompt to let users consolidate folders
 */
export async function promptConsolidation(groups) {
    if (groups.length === 0) {
        return [];
    }

    logger.section("Series Consolidation");
    logger.info("Found folders that could be grouped by series:\n");

    // Show what was found
    for (let i = 0; i < groups.length; i++) {
        const group = groups[i];
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
            message: "Would you like to consolidate any of these into series folders?",
            default: true,
        },
    ]);

    if (!wantConsolidate) {
        return [];
    }

    const consolidations = [];

    // Let user select which groups to consolidate
    const { selectedGroups } = await inquirer.prompt([
        {
            type: "checkbox",
            name: "selectedGroups",
            message: "Select series to consolidate:",
            choices: groups.map((group, i) => ({
                name: `${group.seriesName} (${group.folders.length} folders → 1 folder)`,
                value: i,
                checked: true,
            })),
        },
    ]);

    // For each selected group, confirm or customize the target folder
    for (const groupIndex of selectedGroups) {
        const group = groups[groupIndex];

        const { targetFolder } = await inquirer.prompt([
            {
                type: "input",
                name: "targetFolder",
                message: `Consolidate "${group.seriesName}" folders into:`,
                default: group.suggestedFolder,
            },
        ]);

        consolidations.push({
            seriesName: group.seriesName,
            originalFolders: group.folders,
            newFolder: targetFolder,
        });
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

    for (const { seriesName, originalFolders, newFolder } of consolidations) {
        console.log(chalk.green(`  ✔ ${seriesName}`) + chalk.dim(` → ${newFolder}`));
        console.log(chalk.gray(`    Merged ${originalFolders.length} folders`));
    }

    logger.newline();
}

/**
 * Interactive flow to detect and apply folder consolidation
 */
export async function runConsolidation(assignments) {
    // Get unique folders
    const folders = [...new Set(assignments.map((a) => a.folder))];

    // Find potential groupings
    const groups = findPotentialGroups(folders);

    if (groups.length === 0) {
        logger.info("No similar folders found for consolidation.");
        return assignments;
    }

    // Prompt user
    const consolidations = await promptConsolidation(groups);

    if (consolidations.length === 0) {
        return assignments;
    }

    // Apply consolidations
    const consolidated = applyConsolidation(assignments, consolidations);

    // Show summary
    showConsolidationSummary(consolidations);

    return consolidated;
}
