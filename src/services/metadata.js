import { cleanFilenameForLookup, extractIssueNumber, extractYear } from "../utils/files.js";
import { PUBLISHERS_PATTERNS, PUBLISHER_ALIASES } from "../patterns/publishersPatterns.js";
import { SERIES_PATTERNS } from "../patterns/seriesPatterns.js";

/**
 * Comic metadata lookup service
 * Google Books API (free, no key required)
 */

const GOOGLE_BOOKS_API = "https://www.googleapis.com/books/v1/volumes";

/**
 * Check if publisher is a known comic publisher
 */
function isKnownComicPublisher(publisher) {
    if (!publisher) return false;
    const publisherLower = publisher.toLowerCase();

    // Check if in PUBLISHER_ALIASES
    if (PUBLISHER_ALIASES[publisherLower]) {
        return true;
    }

    // Check if in PUBLISHERS list
    return PUBLISHERS_PATTERNS.some((known) => known.toLowerCase() === publisherLower);
}

/**
 * Normalize publisher name to canonical form
 * Returns null if publisher is not a known comic publisher
 */
function normalizePublisher(publisher) {
    if (!publisher) return null;

    const publisherLower = publisher.toLowerCase();

    // Check if it's in the aliases first
    const normalized = PUBLISHER_ALIASES[publisherLower];
    if (normalized) {
        return normalized;
    }

    // Check if it's in the known publishers list
    if (isKnownComicPublisher(publisher)) {
        return publisher;
    }

    // Not a known comic publisher
    return null;
}

/**
 * Detect publisher from filename
 */
function detectPublisher(filename) {
    const upper = filename.toUpperCase();
    for (const pub of PUBLISHERS_PATTERNS) {
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
            const normalizedPub = normalizePublisher(apiResult.publisher);

            // If publisher was filtered out as non-comic, assign to Unsorted
            if (!normalizedPub) {
                metadata = {
                    ...metadata,
                    series: apiResult.title,
                    publisher: "Unsorted",
                    suggestedFolder: `Unsorted/${apiResult.title}`,
                    confidence: "medium",
                    source: "api-lookup-non-comic-publisher",
                };
                return metadata;
            }

            metadata = {
                ...metadata,
                ...apiResult,
                series: apiResult.title,
                publisher: normalizedPub,
                suggestedFolder: `${normalizedPub}/${apiResult.title}`,
                confidence: "high",
                source: "api-lookup",
            };
            return metadata;
        }
    }

    // Fall back to built-in pattern matching
    const patternMatch = detectSeriesFromPatterns(filename);
    const detectedPublisher = detectPublisher(filename);

    const normalizedPatternPub = normalizePublisher(patternMatch?.publisher);
    const normalizedDetectedPub = normalizePublisher(detectedPublisher);

    metadata.series = patternMatch?.series || null;
    metadata.publisher = normalizedPatternPub || normalizedDetectedPub || null;

    if (patternMatch) {
        metadata.confidence = "high";
        metadata.suggestedFolder = `${metadata.publisher}/${metadata.series}`;
        metadata.source = "pattern-match";
    } else if (normalizedDetectedPub) {
        metadata.confidence = "medium";
        metadata.suggestedFolder = `${normalizedDetectedPub}/${cleanName}`;
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
