import { describe, it, expect } from "vitest";
import { detectSeriesGroups, createSeriesLookupMap } from "../src/services/seriesDetection.js";

describe("Series Detection Service", () => {
    describe("detectSeriesGroups", () => {
        it("should detect series from similar filenames", () => {
            const files = ["/path/Batman #001.cbz", "/path/Batman #002.cbz", "/path/Batman #003.cbz", "/path/Superman #001.cbz"];

            const groups = detectSeriesGroups(files);

            expect(groups.length).toBeGreaterThanOrEqual(1);

            const batmanGroup = groups.find((g) => g.seriesName.toLowerCase().includes("batman"));
            expect(batmanGroup).toBeDefined();
            expect(batmanGroup.files.length).toBe(3);
        });

        it("should handle series with different separators", () => {
            const files = ["/path/Spider-Man #001.cbz", "/path/Spider Man #002.cbz", "/path/SpiderMan #003.cbz"];

            const groups = detectSeriesGroups(files);

            expect(groups.length).toBeGreaterThanOrEqual(1);

            const spiderManGroup = groups.find((g) => g.seriesName.toLowerCase().includes("spider"));
            expect(spiderManGroup).toBeDefined();
            expect(spiderManGroup.files.length).toBeGreaterThanOrEqual(2);
        });

        it("should not group single files", () => {
            const files = ["/path/Batman #001.cbz", "/path/Superman #001.cbz", "/path/Wonder Woman #001.cbz"];

            const groups = detectSeriesGroups(files);

            // All singles, no groups should be formed
            expect(groups.length).toBe(0);
        });

        it("should handle series with years in filenames", () => {
            const files = ["/path/Batman (2023) #001.cbz", "/path/Batman (2023) #002.cbz", "/path/Batman (2023) #003.cbz"];

            const groups = detectSeriesGroups(files);

            expect(groups.length).toBeGreaterThanOrEqual(1);

            const batmanGroup = groups.find((g) => g.seriesName.toLowerCase().includes("batman"));
            expect(batmanGroup).toBeDefined();
            expect(batmanGroup.files.length).toBe(3);
        });

        it("should detect series with special characters", () => {
            const files = ["/path/Y - The Last Man #001.cbz", "/path/Y - The Last Man #002.cbz", "/path/Y - The Last Man #003.cbz"];

            const groups = detectSeriesGroups(files);

            expect(groups.length).toBeGreaterThanOrEqual(1);
        });

        it("should use ComicInfo.xml series names when metadata is provided", () => {
            const files = ["/path/completely-different-name-001.cbz", "/path/also-different-002.cbz", "/path/another-name-003.cbz"];

            // Mock metadata with same series name from ComicInfo.xml
            const metadataResults = [
                { source: "comicinfo-xml", series: "The Amazing Spider-Man", publisher: "Marvel" },
                { source: "comicinfo-xml", series: "The Amazing Spider-Man", publisher: "Marvel" },
                { source: "comicinfo-xml", series: "The Amazing Spider-Man", publisher: "Marvel" },
            ];

            const groups = detectSeriesGroups(files, metadataResults);

            expect(groups.length).toBe(1);
            expect(groups[0].seriesName).toBe("The Amazing Spider-Man");
            expect(groups[0].files.length).toBe(3);
        });

        it("should prioritize ComicInfo.xml series over filename detection", () => {
            const files = ["/path/Batman #001.cbz", "/path/Batman #002.cbz"];

            // ComicInfo.xml says it's actually Superman
            const metadataResults = [
                { source: "comicinfo-xml", series: "Superman", publisher: "DC Comics" },
                { source: "comicinfo-xml", series: "Superman", publisher: "DC Comics" },
            ];

            const groups = detectSeriesGroups(files, metadataResults);

            expect(groups.length).toBe(1);
            expect(groups[0].seriesName).toBe("Superman"); // ComicInfo wins over filename
            expect(groups[0].files.length).toBe(2);
        });

        it("should fall back to filename detection when metadata has no series", () => {
            const files = ["/path/Batman #001.cbz", "/path/Batman #002.cbz"];

            // Metadata without series info
            const metadataResults = [
                { source: "filename-analysis", series: null, publisher: "DC Comics" },
                { source: "filename-analysis", series: null, publisher: "DC Comics" },
            ];

            const groups = detectSeriesGroups(files, metadataResults);

            expect(groups.length).toBe(1);
            expect(groups[0].seriesName.toLowerCase()).toContain("batman"); // Falls back to filename
            expect(groups[0].files.length).toBe(2);
        });

        it("should handle mixed issue numbering formats", () => {
            const files = ["/path/Batman 001.cbz", "/path/Batman #002.cbz", "/path/Batman Issue 003.cbz"];

            const groups = detectSeriesGroups(files);

            expect(groups.length).toBeGreaterThanOrEqual(1);

            const batmanGroup = groups.find((g) => g.seriesName.toLowerCase().includes("batman"));
            expect(batmanGroup).toBeDefined();
            expect(batmanGroup.files.length).toBe(3);
        });

        it("should not group different series with similar names", () => {
            const files = ["/path/Batman #001.cbz", "/path/Batman #002.cbz", "/path/Batman Beyond #001.cbz", "/path/Batman Beyond #002.cbz"];

            const groups = detectSeriesGroups(files);

            expect(groups.length).toBe(2);

            const batmanGroup = groups.find((g) => g.seriesName === "Batman");
            const beyondGroup = groups.find((g) => g.seriesName.includes("Beyond"));

            expect(batmanGroup?.files.length).toBe(2);
            expect(beyondGroup?.files.length).toBe(2);
        });
    });

    describe("createSeriesLookupMap", () => {
        it("should create a map of files to series names", () => {
            const groups = [
                {
                    seriesName: "Batman",
                    files: ["/path/Batman #001.cbz", "/path/Batman #002.cbz"],
                },
                {
                    seriesName: "Superman",
                    files: ["/path/Superman #001.cbz", "/path/Superman #002.cbz"],
                },
            ];

            const lookupMap = createSeriesLookupMap(groups);

            expect(lookupMap.get("/path/Batman #001.cbz")).toBe("Batman");
            expect(lookupMap.get("/path/Batman #002.cbz")).toBe("Batman");
            expect(lookupMap.get("/path/Superman #001.cbz")).toBe("Superman");
            expect(lookupMap.get("/path/Superman #002.cbz")).toBe("Superman");
        });

        it("should handle empty groups array", () => {
            const lookupMap = createSeriesLookupMap([]);

            expect(lookupMap.size).toBe(0);
        });

        it("should map all files in a group", () => {
            const groups = [
                {
                    seriesName: "Walking Dead",
                    files: ["/path/Walking Dead #001.cbz", "/path/Walking Dead #002.cbz", "/path/Walking Dead #003.cbz", "/path/Walking Dead #004.cbz", "/path/Walking Dead #005.cbz"],
                },
            ];

            const lookupMap = createSeriesLookupMap(groups);

            expect(lookupMap.size).toBe(5);
            groups[0].files.forEach((file) => {
                expect(lookupMap.get(file)).toBe("Walking Dead");
            });
        });
    });

    describe("Integration Tests", () => {
        it("should detect and map series in one workflow", () => {
            const files = ["/comics/Batman #001.cbz", "/comics/Batman #002.cbz", "/comics/Batman #003.cbz", "/comics/Superman #001.cbz", "/comics/Superman #002.cbz", "/comics/Wonder Woman #001.cbz"];

            const groups = detectSeriesGroups(files);
            const lookupMap = createSeriesLookupMap(groups);

            // Should have 2 groups (Batman and Superman, Wonder Woman is single)
            expect(groups.length).toBe(2);

            // Lookup map should contain all files from detected series
            expect(lookupMap.get("/comics/Batman #001.cbz")).toBeDefined();
            expect(lookupMap.get("/comics/Superman #001.cbz")).toBeDefined();

            // Wonder Woman should not be in the map (single file)
            expect(lookupMap.get("/comics/Wonder Woman #001.cbz")).toBeUndefined();
        });

        it("should handle real-world messy filenames", () => {
            const files = ["/comics/The_Walking_Dead_#001_(2023)_[Digital].cbz", "/comics/The_Walking_Dead_#002_(2023)_[Digital].cbz", "/comics/The_Walking_Dead_#003_(2023)_[Digital].cbz"];

            const groups = detectSeriesGroups(files);

            expect(groups.length).toBeGreaterThanOrEqual(1);

            const group = groups[0];
            expect(group.files.length).toBe(3);
        });
    });
});
