import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { PUBLISHERS } from "../src/patterns/publishersPatterns.js";
import { SERIES_PATTERNS } from "../src/patterns/seriesPatterns.js";
import { getComicMetadata } from "../src/services/metadata.js";
import { readComicInfo } from "../src/services/comicInfo.js";
import fs from "fs/promises";
import path from "path";
import AdmZip from "adm-zip";
import os from "os";

describe("Integration Tests - Comic Organization Workflow", () => {
    let testDir;

    beforeEach(async () => {
        // Create a temporary directory for test files
        testDir = await fs.mkdtemp(path.join(os.tmpdir(), "comic-test-"));
    });

    afterEach(async () => {
        // Clean up test files
        await fs.rm(testDir, { recursive: true, force: true });
    });

    /**
     * Helper to create a test CBZ file with ComicInfo.xml
     */
    async function createTestCBZ(filename, comicInfoData) {
        const zip = new AdmZip();

        // Create ComicInfo.xml content
        const xmlContent = `<?xml version="1.0"?>
<ComicInfo>
    ${comicInfoData.series ? `<Series>${comicInfoData.series}</Series>` : ""}
    ${comicInfoData.publisher ? `<Publisher>${comicInfoData.publisher}</Publisher>` : ""}
    ${comicInfoData.number ? `<Number>${comicInfoData.number}</Number>` : ""}
    ${comicInfoData.year ? `<Year>${comicInfoData.year}</Year>` : ""}
    ${comicInfoData.title ? `<Title>${comicInfoData.title}</Title>` : ""}
    ${comicInfoData.format ? `<Format>${comicInfoData.format}</Format>` : ""}
    ${comicInfoData.imprint ? `<Imprint>${comicInfoData.imprint}</Imprint>` : ""}
</ComicInfo>`;

        // Add ComicInfo.xml to the zip
        zip.addFile("ComicInfo.xml", Buffer.from(xmlContent, "utf-8"));

        // Add a dummy image file
        zip.addFile("page1.jpg", Buffer.from("fake image data"));

        // Write the CBZ file
        const filePath = path.join(testDir, filename);
        zip.writeZip(filePath);

        return filePath;
    }

    describe("End-to-End Metadata Flow with Real Files", () => {
        it("should process a real CBZ with ComicInfo.xml correctly", async () => {
            const filePath = await createTestCBZ("batman-001.cbz", {
                series: "Batman",
                publisher: "DC Comics",
                number: 1,
                year: 2023,
                title: "The Dark Knight Returns",
            });

            const result = await getComicMetadata(path.basename(filePath), {
                filePath: filePath,
                useApi: false,
            });

            expect(result.source).toBe("comicinfo-xml");
            expect(result.confidence).toBe("highest");
            expect(result.series).toBe("Batman");
            expect(result.publisher).toBe("DC Comics");
            expect(result.suggestedFolder).toBe("DC Comics/Batman");
            expect(result.year).toBe(2023);
            expect(result.issueNumber).toBe(1);
        });

        it("should handle Marvel comic with ComicInfo.xml", async () => {
            const filePath = await createTestCBZ("spider-man-001.cbz", {
                series: "Amazing Spider-Man",
                publisher: "Marvel Comics",
                number: 1,
                year: 2024,
            });

            const result = await getComicMetadata(path.basename(filePath), {
                filePath: filePath,
                useApi: false,
            });

            expect(result.source).toBe("comicinfo-xml");
            expect(result.series).toBe("Amazing Spider-Man");
            expect(result.publisher).toBe("Marvel");
            expect(result.suggestedFolder).toBe("Marvel/Amazing Spider-Man");
        });

        it("should properly organize Image comics with ComicInfo.xml", async () => {
            const filePath = await createTestCBZ("walking-dead-001.cbz", {
                series: "The Walking Dead",
                publisher: "Image Comics",
                number: 1,
            });

            const result = await getComicMetadata(path.basename(filePath), {
                filePath: filePath,
            });

            expect(result.publisher).toBe("Image");
            expect(result.suggestedFolder).toBe("Image/The Walking Dead");
        });

        it("should read ComicInfo.xml directly with readComicInfo", async () => {
            const filePath = await createTestCBZ("test-comic.cbz", {
                series: "Test Series",
                publisher: "Test Publisher",
                number: 42,
                year: 2025,
            });

            const comicInfo = await readComicInfo(filePath);

            expect(comicInfo).not.toBeNull();
            expect(comicInfo.series).toBe("Test Series");
            expect(comicInfo.publisher).toBe("Test Publisher");
            expect(comicInfo.number).toBe(42);
            expect(comicInfo.year).toBe(2025);
        });

        it("should handle CBZ without ComicInfo.xml", async () => {
            // Create a CBZ without ComicInfo.xml
            const zip = new AdmZip();
            zip.addFile("page1.jpg", Buffer.from("fake image data"));
            const filePath = path.join(testDir, "no-metadata.cbz");
            zip.writeZip(filePath);

            const comicInfo = await readComicInfo(filePath);
            expect(comicInfo).toBeNull();

            // Should still extract info from filename
            const result = await getComicMetadata("Batman #001.cbz", {
                filePath: filePath,
                useApi: false,
            });

            expect(result.source).not.toBe("comicinfo-xml");
            expect(result.issueNumber).toBe(1);
        });
    });

    describe("Publisher Normalization with Real Files", () => {
        it("should normalize all publisher variants correctly", async () => {
            const testCases = [
                { input: "Marvel Comics", expected: "Marvel" },
                { input: "DC Comics", expected: "DC Comics" },
                { input: "Image Comics", expected: "Image" },
                { input: "Dark Horse Comics", expected: "Dark Horse" },
                { input: "BOOM! Studios", expected: "BOOM! Studios" },
            ];

            for (const { input, expected } of testCases) {
                const filePath = await createTestCBZ(`test-${input}.cbz`, {
                    series: "Test Series",
                    publisher: input,
                    number: 1,
                });

                const result = await getComicMetadata(path.basename(filePath), {
                    filePath: filePath,
                });

                expect(result.publisher).toBe(expected);
            }
        });

        it("should use imprint when publisher is missing", async () => {
            const filePath = await createTestCBZ("vertigo-test.cbz", {
                series: "Sandman",
                imprint: "Vertigo",
                number: 1,
            });

            const result = await getComicMetadata(path.basename(filePath), {
                filePath: filePath,
                useApi: false,
            });

            expect(result.publisher).toBe("Vertigo");
        });
    });

    describe("Folder Structure Generation", () => {
        it("should create correct folder paths for known publishers", async () => {
            const testCases = [
                {
                    comicInfo: { series: "Batman", publisher: "DC Comics", number: 1 },
                    expected: "DC Comics/Batman",
                },
                {
                    comicInfo: { series: "Spider-Man", publisher: "Marvel Comics", number: 1 },
                    expected: "Marvel/Spider-Man",
                },
                {
                    comicInfo: { series: "Saga", publisher: "Image Comics", number: 1 },
                    expected: "Image/Saga",
                },
            ];

            for (const { comicInfo, expected } of testCases) {
                const filePath = await createTestCBZ(`test-folder.cbz`, comicInfo);

                const result = await getComicMetadata(path.basename(filePath), {
                    filePath: filePath,
                });

                expect(result.suggestedFolder).toBe(expected);
            }
        });

        it("should use Unsorted for unknown publishers", async () => {
            const filePath = await createTestCBZ("unknown.cbz", {
                series: "Unknown Comic",
                publisher: "Some Random Publisher",
                number: 1,
            });

            const result = await getComicMetadata(path.basename(filePath), {
                filePath: filePath,
            });

            expect(result.publisher).toBe("Unsorted");
            expect(result.suggestedFolder).toBe("Unsorted/Unknown Comic");
        });

        it("should handle comics without publisher info", async () => {
            const filePath = await createTestCBZ("indie.cbz", {
                series: "Indie Comic",
                number: 1,
            });

            const result = await getComicMetadata(path.basename(filePath), {
                filePath: filePath,
            });

            expect(result.suggestedFolder).toBe("Unsorted/Indie Comic");
        });
    });

    describe("Pattern Matching Integration", () => {
        it("should correctly match and assign publishers from patterns", () => {
            const marvelPatterns = SERIES_PATTERNS.filter((p) => p.publisher === PUBLISHERS.MARVEL);
            const dcPatterns = SERIES_PATTERNS.filter((p) => p.publisher === PUBLISHERS.DC);
            const imagePatterns = SERIES_PATTERNS.filter((p) => p.publisher === PUBLISHERS.IMAGE);

            expect(marvelPatterns.length).toBeGreaterThan(10);
            expect(dcPatterns.length).toBeGreaterThan(10);
            expect(imagePatterns.length).toBeGreaterThan(10);

            // Verify some key series are present
            const hasSpiderMan = marvelPatterns.some((p) => p.series.toLowerCase().includes("spider-man"));
            const hasBatman = dcPatterns.some((p) => p.series.toLowerCase() === "batman");
            const hasWalkingDead = imagePatterns.some((p) => p.series.toLowerCase() === "the walking dead");

            expect(hasSpiderMan).toBe(true);
            expect(hasBatman).toBe(true);
            expect(hasWalkingDead).toBe(true);
        });
    });

    describe("Metadata Priority Verification with Real Files", () => {
        it("should prioritize ComicInfo.xml over filename patterns", async () => {
            const filePath = await createTestCBZ("batman-001.cbz", {
                series: "Actual Series Name",
                publisher: "DC Comics",
                number: 99,
            });

            const result = await getComicMetadata(path.basename(filePath), {
                filePath: filePath,
                useApi: false,
            });

            // ComicInfo.xml should override filename
            expect(result.series).toBe("Actual Series Name");
            expect(result.issueNumber).toBe(99);
            expect(result.source).toBe("comicinfo-xml");
        });
    });

    describe("Complex ComicInfo.xml Handling", () => {
        it("should handle TPB format from ComicInfo.xml", async () => {
            const filePath = await createTestCBZ("batman-tpb.cbz", {
                series: "Batman",
                publisher: "DC Comics",
                format: "TPB",
            });

            const result = await getComicMetadata(path.basename(filePath), {
                filePath: filePath,
            });

            expect(result.format).toBe("TPB");
            expect(result.series).toBe("Batman");
        });

        it("should handle decimal issue numbers", async () => {
            const filePath = await createTestCBZ("test-decimal.cbz", {
                series: "Test Series",
                publisher: "DC Comics",
                number: 1.5,
            });

            const comicInfo = await readComicInfo(filePath);
            expect(comicInfo.number).toBe(1.5);
        });
    });
});
