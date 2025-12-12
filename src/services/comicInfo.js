import AdmZip from "adm-zip";
import { createExtractorFromFile } from "node-unrar-js";
import { XMLParser } from "fast-xml-parser";
import path from "path";

/**
 * Extract ComicInfo.xml from a CBZ file
 */
async function extractComicInfoFromCBZ(filePath) {
    try {
        const zip = new AdmZip(filePath);
        const zipEntries = zip.getEntries();

        const comicInfoEntry = zipEntries.find((entry) => entry.entryName.toLowerCase() === "comicinfo.xml");

        if (!comicInfoEntry) {
            return null;
        }

        const xmlContent = comicInfoEntry.getData().toString("utf8");
        return xmlContent;
    } catch (error) {
        return null;
    }
}

/**
 * Extract ComicInfo.xml from a CBR file
 */
async function extractComicInfoFromCBR(filePath) {
    try {
        const extractor = await createExtractorFromFile({
            filepath: filePath,
            targetPath: "", // We'll extract to memory
        });

        const { files } = extractor.extract();
        const fileHeaders = [...files];

        const comicInfoFile = fileHeaders.find((file) => file.fileHeader.name.toLowerCase() === "comicinfo.xml");

        if (!comicInfoFile || !comicInfoFile.extraction) {
            return null;
        }

        const xmlContent = Buffer.from(comicInfoFile.extraction).toString("utf8");
        return xmlContent;
    } catch (error) {
        return null;
    }
}

/**
 * Parse ComicInfo.xml content
 */
export function parseComicInfo(xmlContent) {
    if (!xmlContent) return null;

    try {
        const parser = new XMLParser({
            ignoreAttributes: false,
            attributeNamePrefix: "",
        });

        const result = parser.parse(xmlContent);

        // ComicInfo must exist (even if empty string or empty object)
        if (result.ComicInfo === undefined) {
            return null;
        }

        // If ComicInfo exists but is an empty string or non-object, treat as empty object
        const info = typeof result.ComicInfo === "object" ? result.ComicInfo : {};

        return {
            series: info.Series || null,
            number: info.Number ? parseFloat(info.Number) : null,
            volume: info.Volume ? parseInt(info.Volume, 10) : null,
            title: info.Title || null,
            publisher: info.Publisher || null,
            imprint: info.Imprint || null,
            year: info.Year ? parseInt(info.Year, 10) : null,
            month: info.Month ? parseInt(info.Month, 10) : null,
            day: info.Day ? parseInt(info.Day, 10) : null,
            writer: info.Writer || null,
            penciller: info.Penciller || null,
            inker: info.Inker || null,
            colorist: info.Colorist || null,
            letterer: info.Letterer || null,
            coverArtist: info.CoverArtist || null,
            editor: info.Editor || null,
            summary: info.Summary || null,
            storyArc: info.StoryArc || null,
            seriesGroup: info.SeriesGroup || null,
            alternateSeries: info.AlternateSeries || null,
            alternateNumber: info.AlternateNumber || null,
            format: info.Format || null,
            ageRating: info.AgeRating || null,
            web: info.Web || null,
            pageCount: info.PageCount ? parseInt(info.PageCount, 10) : null,
            languageISO: info.LanguageISO || null,
        };
    } catch (error) {
        return null;
    }
}

/**
 * Read and parse ComicInfo.xml from a comic file
 * @param {string} filePath - Path to the comic file
 * @returns {Promise<Object|null>} Parsed ComicInfo data or null if not found/error
 */
export async function readComicInfo(filePath) {
    const ext = path.extname(filePath).toLowerCase();

    let xmlContent = null;

    if (ext === ".cbz") {
        xmlContent = await extractComicInfoFromCBZ(filePath);
    } else if (ext === ".cbr") {
        xmlContent = await extractComicInfoFromCBR(filePath);
    } else {
        // PDF and EPUB don't typically contain ComicInfo.xml
        return null;
    }

    if (!xmlContent) {
        return null;
    }

    return parseComicInfo(xmlContent);
}
