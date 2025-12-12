import { describe, it, expect } from "vitest";
import { getFilename, getExtension, cleanFilenameForLookup, extractIssueNumber, extractYear } from "../src/utils/files.js";

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
});
