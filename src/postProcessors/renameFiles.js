import inquirer from "inquirer";
import chalk from "chalk";
import path from "path";
import fs from "fs-extra";
import ora from "ora";
import { logger } from "../utils/logger.js";
import { findComicFiles, getExtension, getFilename } from "../utils/files.js";
import { getComicMetadata } from "../services/metadata.js";

/**
 * Sanitize filename by replacing invalid characters
 */
function sanitizeFilename(filename) {
    return filename
        .replace(/[<>:"/\\|?*]/g, "-") // Replace invalid characters with hyphen
        .replace(/\s+/g, " ") // Collapse multiple spaces
        .trim();
}

/**
 * Rename format templates
 */
const RENAME_FORMATS = [
    {
        name: "Smart Format (handles TPB, Omnibus, One-shots)",
        value: "smart-format",
        example: "Spider-Man Vol 01 2023.cbz or Batman Omnibus 2024.cbz",
        format: (meta, ext) => {
            if (!meta.series && !meta.cleanedName) return null;

            const seriesName = meta.series || meta.cleanedName;
            const parts = [seriesName];

            // Detect special formats in the original filename
            const originalLower = meta.originalFilename.toLowerCase();

            // Check for TPB/Volume
            if (originalLower.includes("tpb") || originalLower.includes("trade")) {
                const volMatch = meta.originalFilename.match(/(?:vol\.?|volume)\s*(\d+)/i);
                if (volMatch) {
                    parts.push("Vol " + String(volMatch[1]).padStart(2, "0"));
                } else {
                    parts.push("TPB");
                }
            }
            // Check for Omnibus
            else if (originalLower.includes("omnibus") || originalLower.includes("omni")) {
                const volMatch = meta.originalFilename.match(/(?:vol\.?|volume)\s*(\d+)/i);
                if (volMatch) {
                    parts.push("Omnibus Vol " + volMatch[1]);
                } else {
                    parts.push("Omnibus");
                }
            }
            // Check for Book/Part
            else if (originalLower.includes("book") || originalLower.includes("part")) {
                const bookMatch = meta.originalFilename.match(/(?:book|part)\s*(\d+)/i);
                if (bookMatch) {
                    parts.push("Book " + String(bookMatch[1]).padStart(2, "0"));
                }
            }
            // Check for One-shot indicators
            else if (originalLower.includes("one-shot") || originalLower.includes("oneshot") || originalLower.includes("one shot")) {
                parts.push("One-Shot");
            }
            // Regular issue number
            else if (meta.issueNumber !== null) {
                parts.push(String(meta.issueNumber).padStart(3, "0"));
            }
            // No number found - likely a one-shot or special
            else if (!originalLower.match(/\d{3,}/)) {
                // If no significant numbers, it might be a one-shot
                parts.push("One-Shot");
            }

            // Add year if available
            if (meta.year) {
                parts.push(meta.year.toString());
            }

            return parts.join(" ") + ext;
        },
    },
    {
        name: "Publisher - Series - Issue #123 (Year)",
        value: "publisher-series-issue-year",
        example: "Marvel - Spider-Man - Issue #001 (2023).cbz",
        format: (meta, ext) => {
            const parts = [];
            if (meta.publisher) parts.push(meta.publisher);
            if (meta.series) parts.push(meta.series);
            if (meta.issueNumber !== null) parts.push(`Issue #${String(meta.issueNumber).padStart(3, "0")}`);
            if (meta.year) parts.push(`(${meta.year})`);
            return parts.length > 0 ? parts.join(" - ") + ext : null;
        },
    },
    {
        name: "Series - #123 (Year)",
        value: "series-issue-year",
        example: "Spider-Man - #001 (2023).cbz",
        format: (meta, ext) => {
            const parts = [];
            if (meta.series) parts.push(meta.series);
            if (meta.issueNumber !== null) parts.push(`#${String(meta.issueNumber).padStart(3, "0")}`);
            if (meta.year) parts.push(`(${meta.year})`);
            return parts.length > 0 ? parts.join(" - ") + ext : null;
        },
    },
    {
        name: "Series #123",
        value: "series-issue",
        example: "Spider-Man #001.cbz",
        format: (meta, ext) => {
            if (meta.series && meta.issueNumber !== null) {
                return `${meta.series} #${String(meta.issueNumber).padStart(3, "0")}${ext}`;
            }
            return null;
        },
    },
    {
        name: "Publisher - Series (Year)",
        value: "publisher-series-year",
        example: "Marvel - Spider-Man (2023).cbz",
        format: (meta, ext) => {
            const parts = [];
            if (meta.publisher) parts.push(meta.publisher);
            if (meta.series) parts.push(meta.series);
            if (meta.year) parts.push(`(${meta.year})`);
            return parts.length > 0 ? parts.join(" - ") + ext : null;
        },
    },
    {
        name: "Series_Issue_Year (underscores)",
        value: "series-issue-year-underscores",
        example: "Spider-Man_001_2023.cbz",
        format: (meta, ext) => {
            const parts = [];
            if (meta.series) parts.push(meta.series.replace(/\s+/g, "_"));
            if (meta.issueNumber !== null) parts.push(String(meta.issueNumber).padStart(3, "0"));
            if (meta.year) parts.push(meta.year);
            return parts.length > 0 ? parts.join("_") + ext : null;
        },
    },
];

/**
 * Rename files based on metadata
 */
export async function renameFilesHandler(sourceDir, outputDir) {
    logger.newline();

    // Select rename format
    const { format } = await inquirer.prompt([
        {
            type: "list",
            name: "format",
            message: "Select a filename format:",
            choices: RENAME_FORMATS.map((fmt) => ({
                name: `${fmt.name}\n  ${chalk.dim("Example: " + fmt.example)}`,
                value: fmt.value,
                short: fmt.name,
            })),
        },
    ]);

    const selectedFormat = RENAME_FORMATS.find((f) => f.value === format);

    // Ask if they want to use API for better metadata
    const { useApi } = await inquirer.prompt([
        {
            type: "confirm",
            name: "useApi",
            message: "Use Google Books API for enhanced metadata?",
            default: true,
        },
    ]);

    logger.newline();

    // Find all comic files
    const spinner = ora("Finding comic files...").start();
    const files = await findComicFiles(outputDir, { recursive: true });

    if (files.length === 0) {
        spinner.warn("No comic files found");
        return;
    }

    spinner.succeed(`Found ${files.length} comic files`);

    // Let user select which files to process
    logger.newline();
    const { selectedFiles } = await inquirer.prompt([
        {
            type: "checkbox",
            name: "selectedFiles",
            message: "Select files to rename:",
            choices: files.map((filePath) => ({
                name: getFilename(filePath),
                value: filePath,
                checked: true,
            })),
            pageSize: 15,
            validate: (answer) => {
                if (answer.length === 0) {
                    return "You must select at least one file, or press Ctrl+C to cancel.";
                }
                return true;
            },
        },
    ]);

    logger.newline();

    // Analyze files and get metadata
    const spinner2 = ora("Analyzing files and fetching metadata...");
    spinner2.start();
    const renameActions = [];

    for (let i = 0; i < selectedFiles.length; i++) {
        const filePath = selectedFiles[i];
        const filename = getFilename(filePath);
        const ext = getExtension(filePath);

        spinner2.text = `Analyzing ${i + 1}/${selectedFiles.length}: ${filename}`;

        const metadata = await getComicMetadata(filename, { useApi, filePath });
        const newFilename = selectedFormat.format(metadata, ext);

        if (newFilename && newFilename !== filename) {
            const sanitizedFilename = sanitizeFilename(newFilename);
            const newPath = path.join(path.dirname(filePath), sanitizedFilename);
            renameActions.push({
                oldPath: filePath,
                newPath: newPath,
                oldFilename: filename,
                newFilename: sanitizedFilename,
                metadata: metadata,
            });
        }

        // Small delay to avoid API rate limiting
        if (useApi && i < selectedFiles.length - 1) {
            await new Promise((resolve) => setTimeout(resolve, 200));
        }
    }

    spinner2.succeed("Analysis complete");

    if (renameActions.length === 0) {
        logger.warning("No files need to be renamed");
        return;
    }

    // Show preview
    logger.newline();
    logger.section(`Preview: ${renameActions.length} files will be renamed`);
    logger.newline();

    for (let i = 0; i < renameActions.length; i++) {
        const action = renameActions[i];
        console.log(chalk.dim("  Old: ") + chalk.yellow(action.oldFilename));
        console.log(chalk.dim("  New: ") + chalk.green(action.newFilename));
        if (i < renameActions.length - 1) logger.newline();
    }

    logger.newline();

    // Confirm rename
    const { confirm } = await inquirer.prompt([
        {
            type: "confirm",
            name: "confirm",
            message: `Rename ${renameActions.length} files?`,
            default: true,
        },
    ]);

    if (!confirm) {
        logger.info("Rename cancelled");
        return;
    }

    // Execute renames
    logger.newline();
    spinner.start("Renaming files...");

    let renamed = 0;
    let errors = 0;

    for (const action of renameActions) {
        try {
            await fs.move(action.oldPath, action.newPath, { overwrite: false });
            renamed++;
        } catch (error) {
            errors++;
            // If file exists, try with a suffix
            if (error.code === "EEXIST") {
                const ext = path.extname(action.newFilename);
                const base = path.basename(action.newFilename, ext);
                const dir = path.dirname(action.newPath);
                const altFilename = `${base} (copy)${ext}`;
                const altPath = path.join(dir, altFilename);
                try {
                    await fs.move(action.oldPath, altPath, { overwrite: false });
                    renamed++;
                    errors--; // Undo error count
                } catch {
                    // Still failed
                }
            }
        }
    }

    if (errors > 0) {
        spinner.warn(`Renamed ${renamed} files (${errors} failed)`);
    } else {
        spinner.succeed(`Successfully renamed ${renamed} files`);
    }

    // Ask if user wants to manually rename any files
    logger.newline();
    const { wantManualRename } = await inquirer.prompt([
        {
            type: "confirm",
            name: "wantManualRename",
            message: "Would you like to manually rename any of the changed files?",
            default: false,
        },
    ]);

    if (wantManualRename) {
        // Get list of successfully renamed files
        const renamedFiles = renameActions
            .filter((action) => {
                try {
                    // Check if new file exists
                    return fs.existsSync(action.newPath);
                } catch {
                    return false;
                }
            })
            .map((action) => ({
                name: action.newFilename,
                value: action,
            }));

        if (renamedFiles.length === 0) {
            logger.warning("No files available for manual renaming");
            return;
        }

        let continueManualRename = true;

        while (continueManualRename) {
            logger.newline();
            const { fileToRename } = await inquirer.prompt([
                {
                    type: "list",
                    name: "fileToRename",
                    message: "Select a file to rename:",
                    choices: [...renamedFiles, new inquirer.Separator(), { name: chalk.dim("Done - Exit manual rename"), value: null }],
                    pageSize: 15,
                },
            ]);

            if (!fileToRename) {
                continueManualRename = false;
                break;
            }

            // Get new filename from user
            const { newManualFilename } = await inquirer.prompt([
                {
                    type: "input",
                    name: "newManualFilename",
                    message: "Enter new filename (without extension):",
                    default: path.basename(fileToRename.newFilename, path.extname(fileToRename.newFilename)),
                    validate: (input) => {
                        if (!input || input.trim() === "") {
                            return "Filename cannot be empty";
                        }
                        // Check for invalid characters
                        if (/[<>:"/\\|?*]/.test(input)) {
                            return 'Filename cannot contain: < > : " / \\ | ? *';
                        }
                        return true;
                    },
                },
            ]);

            const ext = path.extname(fileToRename.newFilename);
            const finalFilename = sanitizeFilename(newManualFilename.trim() + ext);
            const finalPath = path.join(path.dirname(fileToRename.newPath), finalFilename);

            try {
                await fs.move(fileToRename.newPath, finalPath, { overwrite: false });
                logger.success(`Renamed to: ${finalFilename}`);

                // Update the action in our list
                const index = renamedFiles.findIndex((f) => f.value === fileToRename);
                if (index !== -1) {
                    renamedFiles[index].name = finalFilename;
                    renamedFiles[index].value.newFilename = finalFilename;
                    renamedFiles[index].value.newPath = finalPath;
                }
            } catch (error) {
                if (error.code === "EEXIST") {
                    logger.error(`A file named "${finalFilename}" already exists`);
                } else {
                    logger.error(`Failed to rename: ${error.message}`);
                }
            }
        }

        logger.newline();
        logger.info("Manual rename complete");
    }
}
