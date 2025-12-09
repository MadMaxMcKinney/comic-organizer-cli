import { cleanFilenameForLookup, extractIssueNumber, extractYear } from "../utils/files.js";

/**
 * Comic metadata lookup service
 * Google Books API (free, no key required)
 */

const GOOGLE_BOOKS_API = "https://www.googleapis.com/books/v1/volumes";

// Common comic publishers
const PUBLISHERS = ["Marvel", "DC Comics", "DC", "Image", "Dark Horse", "IDW", "Vertigo", "Boom! Studios", "BOOM", "Dynamite", "Valiant", "Oni Press", "Archie", "Titan", "AWA", "AfterShock"];

// Common series patterns to detect
const SERIES_PATTERNS = [
    { pattern: /batman/i, series: "Batman", publisher: "DC Comics" },
    { pattern: /superman/i, series: "Superman", publisher: "DC Comics" },
    { pattern: /wonder\s*woman/i, series: "Wonder Woman", publisher: "DC Comics" },
    { pattern: /flash/i, series: "The Flash", publisher: "DC Comics" },
    { pattern: /green\s*lantern/i, series: "Green Lantern", publisher: "DC Comics" },
    { pattern: /aquaman/i, series: "Aquaman", publisher: "DC Comics" },
    { pattern: /justice\s*league/i, series: "Justice League", publisher: "DC Comics" },
    { pattern: /spider[-\s]?man/i, series: "Spider-Man", publisher: "Marvel" },
    { pattern: /x[-\s]?men/i, series: "X-Men", publisher: "Marvel" },
    { pattern: /avengers/i, series: "Avengers", publisher: "Marvel" },
    { pattern: /iron\s*man/i, series: "Iron Man", publisher: "Marvel" },
    { pattern: /captain\s*america/i, series: "Captain America", publisher: "Marvel" },
    { pattern: /thor\b/i, series: "Thor", publisher: "Marvel" },
    { pattern: /hulk/i, series: "Hulk", publisher: "Marvel" },
    { pattern: /daredevil/i, series: "Daredevil", publisher: "Marvel" },
    { pattern: /deadpool/i, series: "Deadpool", publisher: "Marvel" },
    { pattern: /wolverine/i, series: "Wolverine", publisher: "Marvel" },
    { pattern: /fantastic\s*four/i, series: "Fantastic Four", publisher: "Marvel" },
    { pattern: /walking\s*dead/i, series: "The Walking Dead", publisher: "Image" },
    { pattern: /spawn/i, series: "Spawn", publisher: "Image" },
    { pattern: /invincible/i, series: "Invincible", publisher: "Image" },
    { pattern: /saga\b/i, series: "Saga", publisher: "Image" },
    { pattern: /sandman/i, series: "Sandman", publisher: "Vertigo" },
    { pattern: /watchmen/i, series: "Watchmen", publisher: "DC Comics" },
    { pattern: /hellboy/i, series: "Hellboy", publisher: "Dark Horse" },
    { pattern: /tmnt|teenage\s*mutant/i, series: "Teenage Mutant Ninja Turtles", publisher: "IDW" },
    { pattern: /transformers/i, series: "Transformers", publisher: "IDW" },
    { pattern: /star\s*wars/i, series: "Star Wars", publisher: "Marvel" },
];

/**
 * Detect publisher from filename
 */
function detectPublisher(filename) {
    const upper = filename.toUpperCase();
    for (const pub of PUBLISHERS) {
        if (upper.includes(pub.toUpperCase())) {
            return pub;
        }
    }
    return null;
}

/**
 * Detect series from filename using patterns
 */
function detectSeriesFromPatterns(filename) {
    for (const { pattern, series, publisher } of SERIES_PATTERNS) {
        if (pattern.test(filename)) {
            return { series, publisher };
        }
    }
    return null;
}

/**
 * Look up comic metadata using Google Books API
 */
async function lookupGoogleBooks(query) {
    try {
        const url = `${GOOGLE_BOOKS_API}?q=${encodeURIComponent(query + " comic")}&maxResults=5`;
        const response = await fetch(url);

        if (!response.ok) {
            return null;
        }

        const data = await response.json();

        if (!data.items || data.items.length === 0) {
            return null;
        }

        // Find the most relevant result
        const book = data.items[0].volumeInfo;

        return {
            title: book.title,
            authors: book.authors || [],
            publisher: book.publisher,
            publishedDate: book.publishedDate,
            description: book.description,
            source: "Google Books",
        };
    } catch (error) {
        return null;
    }
}

/**
 * Extract metadata from filename using API lookup first, falling back to pattern matching
 */
export async function getComicMetadata(filename, options = {}) {
    const { useApi = true } = options;

    const cleanName = cleanFilenameForLookup(filename);
    const issueNumber = extractIssueNumber(filename);
    const year = extractYear(filename);

    let metadata = {
        originalFilename: filename,
        cleanedName: cleanName,
        issueNumber,
        year,
        series: null,
        publisher: null,
        suggestedFolder: null,
        confidence: "low",
        source: "filename-analysis",
    };

    // Try Google Books API first if enabled
    if (useApi) {
        const apiResult = await lookupGoogleBooks(cleanName);
        if (apiResult && apiResult.publisher) {
            metadata = {
                ...metadata,
                ...apiResult,
                series: apiResult.title,
                publisher: apiResult.publisher,
                suggestedFolder: `${apiResult.publisher}/${apiResult.title}`,
                confidence: "high",
                source: "api-lookup",
            };
            return metadata;
        }
    }

    // Fall back to built-in pattern matching
    const patternMatch = detectSeriesFromPatterns(filename);
    const detectedPublisher = detectPublisher(filename);

    metadata.series = patternMatch?.series || null;
    metadata.publisher = patternMatch?.publisher || detectedPublisher || null;

    if (patternMatch) {
        metadata.confidence = "high";
        metadata.suggestedFolder = `${metadata.publisher}/${metadata.series}`;
        metadata.source = "pattern-match";
    } else if (detectedPublisher) {
        metadata.confidence = "medium";
        metadata.suggestedFolder = `${detectedPublisher}/${cleanName}`;
        metadata.source = "publisher-detection";
    }

    // Fallback: use cleaned name as series
    if (!metadata.suggestedFolder) {
        metadata.suggestedFolder = metadata.publisher ? `${metadata.publisher}/${cleanName}` : `Unsorted/${cleanName}`;
    }

    return metadata;
}

/**
 * Batch process multiple files
 */
export async function batchGetMetadata(filenames, options = {}) {
    const { onProgress } = options;
    const results = [];

    for (let i = 0; i < filenames.length; i++) {
        const metadata = await getComicMetadata(filenames[i], options);
        results.push(metadata);

        if (onProgress) {
            onProgress(i + 1, filenames.length, metadata);
        }

        // Small delay to avoid API rate limiting
        if (options.useApi && i < filenames.length - 1) {
            await new Promise((resolve) => setTimeout(resolve, 200));
        }
    }

    return results;
}

/**
 * Group files by suggested folder
 */
export function groupByFolder(metadataResults) {
    const groups = {};

    for (const meta of metadataResults) {
        const folder = meta.suggestedFolder || "Unsorted";
        if (!groups[folder]) {
            groups[folder] = [];
        }
        groups[folder].push(meta);
    }

    return groups;
}
