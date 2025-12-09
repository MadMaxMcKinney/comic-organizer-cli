import inquirer from "inquirer";
import chalk from "chalk";
import path from "path";
import fs from "fs-extra";
import ora from "ora";
import { logger } from "../utils/logger.js";
import { findComicFiles, getExtension, getFilename } from "../utils/files.js";
import { getComicMetadata } from "../services/metadata.js";

/**
 * Rename format templates
 */
const RENAME_FORMATS = [
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
    const files = await findComicFiles(outputDir);

    if (files.length === 0) {
        spinner.warn("No comic files found");
        return;
    }

    spinner.succeed(`Found ${files.length} comic files`);

    // Analyze files and get metadata
    spinner.start("Analyzing files and fetching metadata...");
    const renameActions = [];

    for (let i = 0; i < files.length; i++) {
        const filePath = files[i];
        const filename = getFilename(filePath);
        const ext = getExtension(filePath);

        spinner.text = `Analyzing ${i + 1}/${files.length}: ${filename}`;

        const metadata = await getComicMetadata(filename, { useApi });
        const newFilename = selectedFormat.format(metadata, ext);

        if (newFilename && newFilename !== filename) {
            const newPath = path.join(path.dirname(filePath), newFilename);
            renameActions.push({
                oldPath: filePath,
                newPath: newPath,
                oldFilename: filename,
                newFilename: newFilename,
                metadata: metadata,
            });
        }

        // Small delay to avoid API rate limiting
        if (useApi && i < files.length - 1) {
            await new Promise((resolve) => setTimeout(resolve, 200));
        }
    }

    spinner.succeed("Analysis complete");

    if (renameActions.length === 0) {
        logger.warning("No files need to be renamed");
        return;
    }

    // Show preview
    logger.newline();
    logger.section(`Preview: ${renameActions.length} files will be renamed`);
    logger.newline();

    const previewCount = Math.min(5, renameActions.length);
    for (let i = 0; i < previewCount; i++) {
        const action = renameActions[i];
        console.log(chalk.dim("  Old: ") + chalk.yellow(action.oldFilename));
        console.log(chalk.dim("  New: ") + chalk.green(action.newFilename));
        if (i < previewCount - 1) logger.newline();
    }

    if (renameActions.length > previewCount) {
        logger.newline();
        console.log(chalk.dim(`  ... and ${renameActions.length - previewCount} more files`));
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
}
