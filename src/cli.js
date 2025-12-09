import inquirer from "inquirer";
import path from "path";
import chalk from "chalk";
import { logger } from "./utils/logger.js";
import { directoryExists, fileExists, findComicFiles } from "./utils/files.js";
import { runAutoOrganizer } from "./organizers/auto.js";
import { runManualOrganizer } from "./organizers/manual.js";

const DEFAULT_OUTPUT_DIR = "./organized-comics";
const DEFAULT_CONFIG_FILE = "./filters.json";

/**
 * Display welcome banner
 */
function showBanner() {
    logger.title("COMIC ORGANIZER");
    console.log(chalk.dim("  Organize your digital comic collection with ease"));
    console.log(chalk.dim("  Supports: .cbr, .cbz, .pdf, .epub"));
    logger.newline();
}

/**
 * Main menu selection
 */
async function selectMode() {
    const { mode } = await inquirer.prompt([
        {
            type: "list",
            name: "mode",
            message: "How would you like to organize your comics?",
            choices: [
                {
                    name: "🤖 Automatic - Analyze filenames and look up metadata",
                    value: "auto",
                },
                {
                    name: "📋 Manual - Use a JSON filter configuration file",
                    value: "manual",
                },
                {
                    name: "❓ Help - Learn more about each option",
                    value: "help",
                },
                {
                    name: "👋 Exit",
                    value: "exit",
                },
            ],
        },
    ]);

    return mode;
}

/**
 * Show help information
 */
function showHelp() {
    logger.section("About Automatic Organization");
    console.log(
        chalk.white(`
  Automatic mode analyzes your comic filenames to detect:
  • Publisher (Marvel, DC, Image, etc.)
  • Series name (Spider-Man, Batman, etc.)
  • Issue numbers and years

  It uses pattern matching and can optionally query the Google Books API
  for additional metadata. Files are organized into folders like:
    Publisher/Series/filename.cbz
`)
    );

    logger.section("About Manual Organization");
    console.log(
        chalk.white(`
  Manual mode uses a JSON configuration file with regex patterns
  to match and organize files. This gives you full control over
  the folder structure.

  Example filters.json:
`)
    );

    console.log(
        chalk.cyan(`  {
    "filters": [
      {
        "name": "Marvel",
        "pattern": "marvel|spider-man|x-men|avengers",
        "filters": [
          { "name": "Spider-Man", "pattern": "spider-man" },
          { "name": "X-Men", "pattern": "x-men" }
        ]
      },
      {
        "name": "DC Comics",
        "pattern": "dc|batman|superman"
      }
    ]
  }`)
    );

    console.log(
        chalk.white(`
  Files matching "spider-man" would go to: Marvel/Spider-Man/
  Files matching "dc" but not specific sub-filters go to: DC Comics/
`)
    );

    logger.divider();
}

/**
 * Get source directory from user
 */
async function getSourceDirectory() {
    const { sourceDir } = await inquirer.prompt([
        {
            type: "input",
            name: "sourceDir",
            message: "Enter the source directory containing comic files:",
            default: ".",
            validate: async (input) => {
                const dir = path.resolve(input);
                if (await directoryExists(dir)) {
                    return true;
                }
                return `Directory does not exist: ${dir}`;
            },
        },
    ]);

    const fullPath = path.resolve(sourceDir);

    // Quick scan to show file count
    const files = await findComicFiles(fullPath);
    logger.info(`Found ${files.length} comic files in this directory`);

    if (files.length === 0) {
        const { proceed } = await inquirer.prompt([
            {
                type: "confirm",
                name: "proceed",
                message: "No comic files found. Continue anyway?",
                default: false,
            },
        ]);

        if (!proceed) {
            return null;
        }
    }

    return fullPath;
}

/**
 * Get output directory from user
 */
async function getOutputDirectory(sourceDir) {
    const defaultOutput = path.join(path.dirname(sourceDir), "organized-comics");

    const { outputDir } = await inquirer.prompt([
        {
            type: "input",
            name: "outputDir",
            message: "Enter the destination directory for organized comics:",
            default: defaultOutput,
        },
    ]);

    const fullPath = path.resolve(outputDir);

    // Check if same as source
    if (fullPath === sourceDir) {
        logger.warning("Output directory is the same as source.");
        const { confirm } = await inquirer.prompt([
            {
                type: "confirm",
                name: "confirm",
                message: "Files will be organized in-place. Continue?",
                default: false,
            },
        ]);

        if (!confirm) {
            return getOutputDirectory(sourceDir);
        }
    }

    return fullPath;
}

/**
 * Get configuration file path for manual mode
 */
async function getConfigFile() {
    const { configPath } = await inquirer.prompt([
        {
            type: "input",
            name: "configPath",
            message: "Enter path to your filters.json configuration file:",
            default: DEFAULT_CONFIG_FILE,
            validate: async (input) => {
                const filePath = path.resolve(input);
                if (await fileExists(filePath)) {
                    return true;
                }
                return `File not found: ${filePath}\n  Create a filters.json file or use automatic mode.`;
            },
        },
    ]);

    return path.resolve(configPath);
}

/**
 * Get automatic mode options
 */
async function getAutoOptions() {
    const { useApi, dryRun } = await inquirer.prompt([
        {
            type: "confirm",
            name: "useApi",
            message: "Use Google Books API for enhanced metadata lookup?",
            default: true,
        },
        {
            type: "confirm",
            name: "dryRun",
            message: "Run in preview mode? (no files will be moved)",
            default: true,
        },
    ]);

    return { useApi, dryRun };
}

/**
 * Get manual mode options
 */
async function getManualOptions() {
    const { includeUnmatched, dryRun } = await inquirer.prompt([
        {
            type: "confirm",
            name: "includeUnmatched",
            message: 'Move unmatched files to an "_Unmatched" folder?',
            default: false,
        },
        {
            type: "confirm",
            name: "dryRun",
            message: "Run in preview mode? (no files will be moved)",
            default: true,
        },
    ]);

    return { includeUnmatched, dryRun };
}

/**
 * Ask to run again or exit
 */
async function askContinue() {
    logger.newline();

    const { action } = await inquirer.prompt([
        {
            type: "list",
            name: "action",
            message: "What would you like to do next?",
            choices: [
                { name: "🔄 Organize more comics", value: "restart" },
                { name: "👋 Exit", value: "exit" },
            ],
        },
    ]);

    return action;
}

/**
 * Run automatic organization flow
 */
async function runAutoFlow() {
    const sourceDir = await getSourceDirectory();
    if (!sourceDir) return;

    const outputDir = await getOutputDirectory(sourceDir);
    const options = await getAutoOptions();

    logger.newline();

    const result = await runAutoOrganizer(sourceDir, outputDir, options);

    if (options.dryRun && result.wouldMove > 0) {
        logger.newline();
        const { execute } = await inquirer.prompt([
            {
                type: "confirm",
                name: "execute",
                message: `Ready to move ${result.wouldMove} files. Execute now?`,
                default: true,
            },
        ]);

        if (execute) {
            await runAutoOrganizer(sourceDir, outputDir, { ...options, dryRun: false });
        }
    }
}

/**
 * Run manual organization flow
 */
async function runManualFlow() {
    const sourceDir = await getSourceDirectory();
    if (!sourceDir) return;

    const outputDir = await getOutputDirectory(sourceDir);
    const configPath = await getConfigFile();
    const options = await getManualOptions();

    logger.newline();

    const result = await runManualOrganizer(sourceDir, outputDir, configPath, options);

    if (options.dryRun && result.wouldMove > 0) {
        logger.newline();
        const { execute } = await inquirer.prompt([
            {
                type: "confirm",
                name: "execute",
                message: `Ready to move ${result.wouldMove} files. Execute now?`,
                default: true,
            },
        ]);

        if (execute) {
            await runManualOrganizer(sourceDir, outputDir, configPath, { ...options, dryRun: false });
        }
    }
}

/**
 * Main CLI runner
 */
export async function runCLI() {
    showBanner();

    let running = true;

    while (running) {
        const mode = await selectMode();

        switch (mode) {
            case "auto":
                await runAutoFlow();
                break;

            case "manual":
                await runManualFlow();
                break;

            case "help":
                showHelp();
                continue;

            case "exit":
                running = false;
                continue;
        }

        if (mode !== "help" && mode !== "exit") {
            const action = await askContinue();
            if (action === "exit") {
                running = false;
            }
        }
    }

    logger.newline();
    logger.success("Happy reading! 📚");
    logger.newline();
}
