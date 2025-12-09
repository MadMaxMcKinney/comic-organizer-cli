import { getFilename } from "../utils/files.js";
import inquirer from "inquirer";
import chalk from "chalk";
import { logger } from "../utils/logger.js";

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
 * Extract potential series name from a filename
 * Strips version/volume/issue numbers to get clean series name
 */
function extractSeriesName(filename) {
    let name = filename.replace(/\.[^.]+$/, ""); // Remove extension

    // Replace separators with spaces
    name = name.replace(/[-_]/g, " ").replace(/\s+/g, " ").trim();

    // Common patterns to extract series name (order matters - most specific first)
    const patterns = [
        // "Speed Racer 003 (2025)" -> "Speed Racer" (issue number with year)
        /^(.+?)(?:\s+\d{3,}\s*\(\d{4}\))/i,
        // "Geiger V04 (2025)" or "The Power Fantasy v02" -> "Geiger" / "The Power Fantasy"
        /^(.+?)(?:\s+[Vv]\d+)/i,
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
        // "Hellboy 001" -> "Hellboy" (3+ digit numbers)
        /^(.+?)(?:\s+\d{3,})/i,
        // "Speed Racer 3" -> "Speed Racer" (1-2 digit numbers at end)
        /^(.+?)(?:\s+\d{1,2})$/i,
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
 * Detect series groupings from a list of files
 * Returns groups of files that belong to the same series
 * This runs BEFORE folder organization to inform folder structure
 */
export function detectSeriesGroups(files) {
    const SIMILARITY_THRESHOLD = 0.5;
    const groups = [];

    // Extract series name from each file
    const fileInfo = files.map((file) => {
        const filename = getFilename(file);
        const seriesName = extractSeriesName(filename);
        const normalizedSeries = normalizeForComparison(seriesName);
        return { file, filename, seriesName, normalizedSeries };
    });

    // Group similar files
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
            // Use the shortest series name (usually most accurate)
            const shortestName = matchingFiles.reduce((shortest, f) => (f.seriesName.length < shortest.length ? f.seriesName : shortest), matchingFiles[0].seriesName);

            // Capitalize first letter of each word
            const formattedName = shortestName
                .split(" ")
                .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
                .join(" ");

            groups.push({
                seriesName: formattedName,
                files: matchingFiles.map((f) => f.file),
                fileCount: matchingFiles.length,
            });
        }
    }

    // Sort by file count (most first)
    groups.sort((a, b) => b.fileCount - a.fileCount);

    return groups;
}

/**
 * Create a map of file -> series name for quick lookup
 */
export function createSeriesLookupMap(seriesGroups) {
    const map = new Map();

    for (const group of seriesGroups) {
        for (const file of group.files) {
            map.set(file, group.seriesName);
        }
    }

    return map;
}

/**
 * Prompt user to review and optionally rename detected series
 * Returns updated series groups with user-confirmed names
 */
export async function promptSeriesReview(seriesGroups) {
    if (seriesGroups.length === 0) {
        return seriesGroups;
    }

    logger.newline();
    logger.section("Detected Series");
    logger.info("Review the series detected from your files:\n");

    // Show all detected series
    for (let i = 0; i < seriesGroups.length; i++) {
        const group = seriesGroups[i];
        console.log(chalk.cyan(`  ${i + 1}. ${group.seriesName}`) + chalk.dim(` (${group.fileCount} files)`));

        // Show first 3 files as examples
        const examples = group.files.slice(0, 3);
        for (const file of examples) {
            console.log(chalk.gray(`      • ${getFilename(file)}`));
        }
        if (group.fileCount > 3) {
            console.log(chalk.gray(`      ... and ${group.fileCount - 3} more`));
        }
        console.log();
    }

    // Ask if user wants to rename any
    const { wantRename } = await inquirer.prompt([
        {
            type: "confirm",
            name: "wantRename",
            message: "Would you like to rename any of these series?",
            default: false,
        },
    ]);

    if (!wantRename) {
        return seriesGroups;
    }

    // Let user select which series to rename
    const { seriesToRename } = await inquirer.prompt([
        {
            type: "checkbox",
            name: "seriesToRename",
            message: "Select series to rename:",
            choices: seriesGroups.map((group, index) => ({
                name: `${group.seriesName} (${group.fileCount} files)`,
                value: index,
            })),
        },
    ]);

    if (seriesToRename.length === 0) {
        return seriesGroups;
    }

    // Prompt for new names one by one
    const updatedGroups = [...seriesGroups];

    for (const index of seriesToRename) {
        const group = updatedGroups[index];
        logger.newline();

        const { newName } = await inquirer.prompt([
            {
                type: "input",
                name: "newName",
                message: `Enter new name for "${group.seriesName}":`,
                default: group.seriesName,
                validate: (input) => {
                    if (!input || input.trim().length === 0) {
                        return "Series name cannot be empty";
                    }
                    return true;
                },
            },
        ]);

        updatedGroups[index] = {
            ...group,
            seriesName: newName.trim(),
        };

        logger.success(`Renamed to: ${newName.trim()}`);
    }

    return updatedGroups;
}
