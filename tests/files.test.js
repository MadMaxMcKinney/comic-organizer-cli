import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getFilename, getExtension, cleanFilenameForLookup, extractIssueNumber, extractYear, findComicFiles } from "../src/utils/files.js";
import fs from "fs/promises";
import path from "path";
import os from "os";

describe("File Utils", () => {
    describe("getFilename", () => {
        it("should extract filename from full path", () => {
            expect(getFilename("/path/to/file.cbz")).toBe("file.cbz");
            expect(getFilename("/Users/test/Comics/Batman #001.cbr")).toBe("Batman #001.cbr");
            expect(getFilename("Spider-Man.pdf")).toBe("Spider-Man.pdf");
        });

        it("should handle paths with spaces", () => {
            expect(getFilename("/path/to/My Comics/Batman #001.cbz")).toBe("Batman #001.cbz");
        });
    });

    describe("getExtension", () => {
        it("should extract file extension in lowercase", () => {
            expect(getExtension("file.cbz")).toBe(".cbz");
            expect(getExtension("file.CBZ")).toBe(".cbz");
            expect(getExtension("file.CBR")).toBe(".cbr");
            expect(getExtension("file.PDF")).toBe(".pdf");
        });

        it("should handle files with multiple dots", () => {
            expect(getExtension("Batman.Issue.001.cbz")).toBe(".cbz");
        });
    });

    describe("cleanFilenameForLookup", () => {
        it("should remove file extension", () => {
            const result = cleanFilenameForLookup("Batman #001.cbz");
            expect(result).not.toContain(".cbz");
        });

        it("should remove bracketed content", () => {
            const result = cleanFilenameForLookup("Batman #001 [Digital].cbz");
            expect(result).not.toContain("[Digital]");
            expect(result).toContain("Batman");
        });

        it("should remove parenthetical content", () => {
            const result = cleanFilenameForLookup("Batman #001 (2023).cbz");
            expect(result).not.toContain("(2023)");
            expect(result).not.toContain("2023");
        });

        it("should remove issue numbers", () => {
            const result = cleanFilenameForLookup("Batman #001.cbz");
            expect(result).not.toContain("#001");
            expect(result).not.toContain("#");
        });

        it("should remove volume numbers", () => {
            const result = cleanFilenameForLookup("Batman v01.cbz");
            expect(result).not.toContain("v01");
        });

        it("should convert dashes and underscores to spaces", () => {
            const result = cleanFilenameForLookup("Spider-Man_001.cbz");
            expect(result).toContain("Spider Man");
        });

        it("should collapse multiple spaces", () => {
            const result = cleanFilenameForLookup("Batman   Issue   001.cbz");
            expect(result).not.toContain("   ");
        });

        it("should handle complex filenames", () => {
            const result = cleanFilenameForLookup("The_Walking_Dead_#001_(2023)_[Digital].cbz");
            expect(result.trim()).toBe("The Walking Dead");
        });
    });

    describe("extractIssueNumber", () => {
        it("should extract issue numbers with hash", () => {
            expect(extractIssueNumber("Batman #001.cbz")).toBe(1);
            expect(extractIssueNumber("Spider-Man #123.cbr")).toBe(123);
        });

        it("should extract issue numbers without hash", () => {
            expect(extractIssueNumber("Batman 001.cbz")).toBe(1);
            expect(extractIssueNumber("Spider-Man 123.cbr")).toBe(123);
        });

        it("should handle padded numbers", () => {
            expect(extractIssueNumber("Batman #0001.cbz")).toBe(1);
            expect(extractIssueNumber("Batman #001.cbz")).toBe(1);
        });

        it("should return null if no issue number found", () => {
            expect(extractIssueNumber("Batman.cbz")).toBe(null);
            expect(extractIssueNumber("Batman TPB.cbz")).toBe(null);
        });

        it("should extract first number found", () => {
            expect(extractIssueNumber("Batman #001 (2023).cbz")).toBe(1);
        });
    });

    describe("extractYear", () => {
        it("should extract 4-digit years", () => {
            expect(extractYear("Batman (2023).cbz")).toBe(2023);
            expect(extractYear("Spider-Man 2022.cbr")).toBe(2022);
            expect(extractYear("X-Men [1991].cbz")).toBe(1991);
        });

        it("should extract years starting with 19 or 20", () => {
            expect(extractYear("Batman (1989).cbz")).toBe(1989);
            expect(extractYear("Batman (2099).cbz")).toBe(2099);
        });

        it("should return null if no year found", () => {
            expect(extractYear("Batman #001.cbz")).toBe(null);
            expect(extractYear("Spider-Man.cbr")).toBe(null);
        });

        it("should extract first valid year", () => {
            expect(extractYear("Batman (2023) (2022).cbz")).toBe(2023);
        });

        it("should not extract issue numbers as years", () => {
            expect(extractYear("Batman #001.cbz")).toBe(null);
        });
    });

    describe("findComicFiles", () => {
        let testDir;

        beforeEach(async () => {
            // Create a temporary directory for test files
            testDir = await fs.mkdtemp(path.join(os.tmpdir(), "comic-files-test-"));
        });

        afterEach(async () => {
            // Clean up test files
            await fs.rm(testDir, { recursive: true, force: true });
        });

        it("should find comic files in top-level directory only (non-recursive)", async () => {
            // Create files in root
            await fs.writeFile(path.join(testDir, "Batman #001.cbz"), "");
            await fs.writeFile(path.join(testDir, "Superman #001.cbr"), "");
            await fs.writeFile(path.join(testDir, "not-a-comic.txt"), "");

            // Create subdirectory with files
            const subDir = path.join(testDir, "Marvel");
            await fs.mkdir(subDir);
            await fs.writeFile(path.join(subDir, "Spider-Man #001.cbz"), "");

            const files = await findComicFiles(testDir, { recursive: false });

            expect(files.length).toBe(2); // Only top-level comics
            expect(files.some((f) => f.includes("Batman"))).toBe(true);
            expect(files.some((f) => f.includes("Superman"))).toBe(true);
            expect(files.some((f) => f.includes("Spider-Man"))).toBe(false); // Not in subdirectory
        });

        it("should find comic files recursively in all subdirectories", async () => {
            // Create files in root
            await fs.writeFile(path.join(testDir, "Batman #001.cbz"), "");

            // Create nested subdirectories with files
            const dcDir = path.join(testDir, "DC Comics", "Batman");
            await fs.mkdir(dcDir, { recursive: true });
            await fs.writeFile(path.join(dcDir, "Batman #002.cbz"), "");

            const marvelDir = path.join(testDir, "Marvel", "Spider-Man");
            await fs.mkdir(marvelDir, { recursive: true });
            await fs.writeFile(path.join(marvelDir, "Spider-Man #001.cbz"), "");
            await fs.writeFile(path.join(marvelDir, "Spider-Man #002.cbr"), "");

            // Non-comic files
            await fs.writeFile(path.join(testDir, "readme.txt"), "");
            await fs.writeFile(path.join(dcDir, "info.txt"), "");

            const files = await findComicFiles(testDir, { recursive: true });

            expect(files.length).toBe(4); // All comics including subdirectories
            expect(files.some((f) => f.includes("Batman #001"))).toBe(true);
            expect(files.some((f) => f.includes("Batman #002"))).toBe(true);
            expect(files.some((f) => f.includes("Spider-Man #001"))).toBe(true);
            expect(files.some((f) => f.includes("Spider-Man #002"))).toBe(true);
            expect(files.some((f) => f.includes(".txt"))).toBe(false);
        });

        it("should find all supported comic file extensions", async () => {
            await fs.writeFile(path.join(testDir, "comic1.cbz"), "");
            await fs.writeFile(path.join(testDir, "comic2.cbr"), "");
            await fs.writeFile(path.join(testDir, "comic3.pdf"), "");
            await fs.writeFile(path.join(testDir, "comic4.epub"), "");
            await fs.writeFile(path.join(testDir, "not-comic.zip"), "");

            const files = await findComicFiles(testDir, { recursive: false });

            expect(files.length).toBe(4);
            expect(files.some((f) => f.endsWith(".cbz"))).toBe(true);
            expect(files.some((f) => f.endsWith(".cbr"))).toBe(true);
            expect(files.some((f) => f.endsWith(".pdf"))).toBe(true);
            expect(files.some((f) => f.endsWith(".epub"))).toBe(true);
            expect(files.some((f) => f.endsWith(".zip"))).toBe(false);
        });

        it("should handle empty directory", async () => {
            const files = await findComicFiles(testDir, { recursive: true });
            expect(files.length).toBe(0);
        });

        it("should handle deeply nested directories", async () => {
            const deepDir = path.join(testDir, "level1", "level2", "level3", "level4");
            await fs.mkdir(deepDir, { recursive: true });
            await fs.writeFile(path.join(deepDir, "deep-comic.cbz"), "");

            const files = await findComicFiles(testDir, { recursive: true });

            expect(files.length).toBe(1);
            expect(files[0]).toContain("deep-comic.cbz");
        });

        it("should return absolute paths", async () => {
            await fs.writeFile(path.join(testDir, "Batman #001.cbz"), "");

            const files = await findComicFiles(testDir, { recursive: false });

            expect(files.length).toBe(1);
            expect(path.isAbsolute(files[0])).toBe(true);
        });
    });
});
