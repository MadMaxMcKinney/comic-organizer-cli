import inquirer from "inquirer";
import chalk from "chalk";
import { logger } from "../utils/logger.js";
import { renameFilesHandler } from "../postProcessors/renameFiles.js";
import { consolidateFoldersHandler } from "../postProcessors/consolidateFolders.js";

/**
 * Available post-processing options
 * Each option should have:
 * - name: Display name
 * - value: Internal identifier
 * - description: What this option does
 * - handler: Function to execute the post-processing task
 */
const POST_PROCESSING_OPTIONS = [
    {
        name: "Consolidate similar folders",
        value: "consolidate-folders",
        description: "Merge folders with similar names into single folders",
        handler: consolidateFoldersHandler,
    },
    {
        name: "Rename files based on metadata",
        value: "rename-files",
        description: "Rename files using metadata (publisher, series, issue, year)",
        handler: renameFilesHandler,
    },
];

/**
 * Prompt user if they want to run post-processing
 */
async function askForPostProcessing() {
    logger.newline();
    logger.section("Post-Processing");

    const { wantPostProcessing } = await inquirer.prompt([
        {
            type: "confirm",
            name: "wantPostProcessing",
            message: "Would you like to run any post-processing operations?",
            default: false,
        },
    ]);

    return wantPostProcessing;
}

/**
 * Show checklist of post-processing options and get selections
 */
async function selectPostProcessingOptions() {
    logger.info("Select the post-processing operations you'd like to run:");
    logger.newline();

    const choices = POST_PROCESSING_OPTIONS.map((option) => ({
        name: `${option.name} - ${chalk.dim(option.description)}`,
        value: option.value,
        checked: false,
    }));

    const { selectedOptions } = await inquirer.prompt([
        {
            type: "checkbox",
            name: "selectedOptions",
            message: "Select post-processing operations:",
            choices: choices,
            validate: (answer) => {
                if (answer.length === 0) {
                    return "You must choose at least one option, or press Ctrl+C to cancel.";
                }
                return true;
            },
        },
    ]);

    return selectedOptions;
}

/**
 * Execute selected post-processing operations
 */
async function executePostProcessing(selectedOptions, sourceDir, outputDir) {
    logger.newline();
    logger.section("Running Post-Processing Operations");

    for (const optionValue of selectedOptions) {
        const option = POST_PROCESSING_OPTIONS.find((opt) => opt.value === optionValue);

        if (option) {
            logger.newline();
            logger.info(`Running: ${option.name}`);

            try {
                await option.handler(sourceDir, outputDir);
                logger.success(`✓ ${option.name} completed`);
            } catch (error) {
                logger.error(`✗ ${option.name} failed: ${error.message}`);
            }
        }
    }

    logger.newline();
    logger.success("Post-processing complete!");
}

/**
 * Main post-processing flow
 * @param {string} sourceDir - Source directory path
 * @param {string} outputDir - Output directory path
 */
export async function runPostProcessing(sourceDir, outputDir) {
    const wantPostProcessing = await askForPostProcessing();

    if (!wantPostProcessing) {
        return;
    }

    const selectedOptions = await selectPostProcessingOptions();

    if (selectedOptions.length > 0) {
        await executePostProcessing(selectedOptions, sourceDir, outputDir);
    }
}

/**
 * Register a new post-processing option
 * This allows extending the functionality dynamically
 */
export function registerPostProcessingOption(option) {
    if (!option.name || !option.value || !option.handler) {
        throw new Error("Post-processing option must have name, value, and handler");
    }

    POST_PROCESSING_OPTIONS.push(option);
}

/**
 * Get all registered post-processing options
 */
export function getPostProcessingOptions() {
    return [...POST_PROCESSING_OPTIONS];
}

/**
 * Run post-processing directly (standalone mode)
 * @param {string} targetDir - Directory to run post-processing on
 */
export async function runPostProcessingStandalone(targetDir) {
    logger.section("Post-Processing");
    logger.info(`Target directory: ${targetDir}`);
    logger.newline();

    const selectedOptions = await selectPostProcessingOptions();

    if (selectedOptions.length > 0) {
        await executePostProcessing(selectedOptions, targetDir, targetDir);
    }
}
