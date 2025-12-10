import fs from "fs-extra";
import path from "path";
import { glob } from "glob";

const COMIC_EXTENSIONS = [".cbr", ".cbz", ".pdf", ".epub"];

/**
 * Find all comic files in a directory
 * @param {string} directory - The directory to search
 * @param {object} options - Search options
 * @param {boolean} options.recursive - Whether to search subdirectories (default: false)
 */
export async function findComicFiles(directory, options = {}) {
    const { recursive = false } = options;
    const pattern = recursive ? path.join(directory, "**/*") : path.join(directory, "*");
    const allFiles = await glob(pattern, { nodir: true });

    return allFiles.filter((file) => {
        const ext = path.extname(file).toLowerCase();
        return COMIC_EXTENSIONS.includes(ext);
    });
}

/**
 * Get just the filename from a path
 */
export function getFilename(filePath) {
    return path.basename(filePath);
}

/**
 * Get the extension of a file
 */
export function getExtension(filePath) {
    return path.extname(filePath).toLowerCase();
}

/**
 * Move a file to a destination folder
 */
export async function moveFile(sourcePath, destinationFolder, options = {}) {
    const { dryRun = false } = options;
    const filename = path.basename(sourcePath);
    const destinationPath = path.join(destinationFolder, filename);

    if (dryRun) {
        return { source: sourcePath, destination: destinationPath, moved: false };
    }

    await fs.ensureDir(destinationFolder);
    await fs.move(sourcePath, destinationPath, { overwrite: false });

    return { source: sourcePath, destination: destinationPath, moved: true };
}

/**
 * Check if a directory exists
 */
export async function directoryExists(dirPath) {
    try {
        const stat = await fs.stat(dirPath);
        return stat.isDirectory();
    } catch {
        return false;
    }
}

/**
 * Check if a file exists
 */
export async function fileExists(filePath) {
    try {
        await fs.access(filePath);
        return true;
    } catch {
        return false;
    }
}

/**
 * Read and parse a JSON file
 */
export async function readJsonFile(filePath) {
    const content = await fs.readFile(filePath, "utf-8");
    return JSON.parse(content);
}

/**
 * Get file size in human readable format
 */
export async function getFileSize(filePath) {
    const stats = await fs.stat(filePath);
    const bytes = stats.size;

    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + " MB";
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + " GB";
}

/**
 * Clean filename for metadata lookup (remove extensions, brackets, etc.)
 */
export function cleanFilenameForLookup(filename) {
    let cleaned = path.basename(filename, path.extname(filename));

    // Remove common patterns like (2019), [Digital], etc.
    cleaned = cleaned
        .replace(/\[.*?\]/g, "") // Remove [bracketed content]
        .replace(/\(.*?\)/g, "") // Remove (parenthetical content)
        .replace(/v\d+/gi, "") // Remove volume numbers like v01
        .replace(/#\d+/g, "") // Remove issue numbers like #001
        .replace(/\d{4}/g, "") // Remove years
        .replace(/[-_]+/g, " ") // Replace dashes and underscores with spaces
        .replace(/\s+/g, " ") // Collapse multiple spaces
        .trim();

    return cleaned;
}

/**
 * Extract potential issue number from filename
 */
export function extractIssueNumber(filename) {
    const match = filename.match(/#?(\d{1,4})\b/);
    return match ? parseInt(match[1], 10) : null;
}

/**
 * Extract potential year from filename
 */
export function extractYear(filename) {
    const match = filename.match(/\b(19|20)\d{2}\b/);
    return match ? parseInt(match[0], 10) : null;
}
