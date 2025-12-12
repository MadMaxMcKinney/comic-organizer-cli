import { describe, it, expect, vi, beforeEach } from "vitest";
import { PUBLISHERS, PUBLISHER_ALIASES } from "../src/patterns/publishersPatterns.js";

// Mock the external dependencies
vi.mock("../src/services/comicInfo.js", () => ({
    readComicInfo: vi.fn(),
}));

vi.mock("../src/utils/files.js", async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
    };
});

describe("Metadata Service", () => {
    let getComicMetadata;
    let readComicInfo;

    beforeEach(async () => {
        // Clear all mocks before each test
        vi.clearAllMocks();

        // Import the mocked module
        const comicInfoModule = await import("../src/services/comicInfo.js");
        readComicInfo = comicInfoModule.readComicInfo;

        // Import the metadata service
        const metadataModule = await import("../src/services/metadata.js");
        getComicMetadata = metadataModule.getComicMetadata;
    });

    describe("Publisher Normalization", () => {
        it("should normalize known publishers via aliases", async () => {
            // Mock readComicInfo to return null (skip ComicInfo.xml)
            readComicInfo.mockResolvedValue(null);

            // Mock fetch to return a result with a normalizable publisher
            global.fetch = vi.fn(() =>
                Promise.resolve({
                    ok: true,
                    json: () =>
                        Promise.resolve({
                            items: [
                                {
                                    volumeInfo: {
                                        title: "Spider-Man",
                                        publisher: "Marvel Comics",
                                        publishedDate: "2023",
                                    },
                                },
                            ],
                        }),
                })
            );

            const result = await getComicMetadata("Spider-Man #001.cbz", { useApi: true });

            expect(result.publisher).toBe("Marvel");
        });

        it("should assign Unsorted to non-comic publishers", async () => {
            readComicInfo.mockResolvedValue(null);

            global.fetch = vi.fn(() =>
                Promise.resolve({
                    ok: true,
                    json: () =>
                        Promise.resolve({
                            items: [
                                {
                                    volumeInfo: {
                                        title: "Some Book",
                                        publisher: "Random House",
                                        publishedDate: "2023",
                                    },
                                },
                            ],
                        }),
                })
            );

            const result = await getComicMetadata("Some Book.cbz", { useApi: true });

            expect(result.publisher).toBe("Unsorted");
            expect(result.source).toBe("api-lookup-non-comic-publisher");
        });
    });

    describe("ComicInfo.xml Priority", () => {
        it("should use ComicInfo.xml when available", async () => {
            const comicInfo = {
                series: "Batman",
                publisher: "DC Comics",
                number: 1,
                year: 2023,
                title: "The Dark Knight",
            };

            readComicInfo.mockResolvedValue(comicInfo);

            const result = await getComicMetadata("batman001.cbz", {
                filePath: "/path/to/batman001.cbz",
                useApi: true,
            });

            expect(result.source).toBe("comicinfo-xml");
            expect(result.confidence).toBe("highest");
            expect(result.series).toBe("Batman");
            expect(result.publisher).toBe("DC Comics");
            expect(result.issueNumber).toBe(1);
        });

        it("should normalize publisher from ComicInfo.xml", async () => {
            const comicInfo = {
                series: "Spider-Man",
                publisher: "Marvel Comics",
                number: 1,
            };

            readComicInfo.mockResolvedValue(comicInfo);

            const result = await getComicMetadata("spiderman001.cbz", {
                filePath: "/path/to/spiderman001.cbz",
            });

            expect(result.publisher).toBe("Marvel");
            expect(result.suggestedFolder).toBe("Marvel/Spider-Man");
        });

        it("should fall back to imprint if publisher not specified", async () => {
            const comicInfo = {
                series: "Sandman",
                imprint: "Vertigo",
                number: 1,
            };

            readComicInfo.mockResolvedValue(comicInfo);

            const result = await getComicMetadata("sandman001.cbz", {
                filePath: "/path/to/sandman001.cbz",
            });

            expect(result.publisher).toBe("Vertigo");
        });
    });

    describe("Metadata Source Priority", () => {
        it("should prioritize ComicInfo.xml over API", async () => {
            const comicInfo = {
                series: "Batman",
                publisher: "DC Comics",
                number: 1,
            };

            readComicInfo.mockResolvedValue(comicInfo);

            global.fetch = vi.fn(() =>
                Promise.resolve({
                    ok: true,
                    json: () =>
                        Promise.resolve({
                            items: [
                                {
                                    volumeInfo: {
                                        title: "Different Title",
                                        publisher: "Different Publisher",
                                    },
                                },
                            ],
                        }),
                })
            );

            const result = await getComicMetadata("batman001.cbz", {
                filePath: "/path/to/batman001.cbz",
                useApi: true,
            });

            expect(result.source).toBe("comicinfo-xml");
            expect(result.series).toBe("Batman");
            expect(result.publisher).toBe("DC Comics");
            expect(fetch).not.toHaveBeenCalled();
        });

        it("should fall back to API when ComicInfo.xml not available", async () => {
            readComicInfo.mockResolvedValue(null);

            global.fetch = vi.fn(() =>
                Promise.resolve({
                    ok: true,
                    json: () =>
                        Promise.resolve({
                            items: [
                                {
                                    volumeInfo: {
                                        title: "Spider-Man",
                                        publisher: "Marvel Comics",
                                    },
                                },
                            ],
                        }),
                })
            );

            const result = await getComicMetadata("spiderman001.cbz", {
                filePath: "/path/to/spiderman001.cbz",
                useApi: true,
            });

            expect(result.source).toBe("api-lookup");
            expect(fetch).toHaveBeenCalled();
        });
    });

    describe("Metadata Extraction", () => {
        it("should extract issue number from filename", async () => {
            readComicInfo.mockResolvedValue(null);
            global.fetch = vi.fn(() =>
                Promise.resolve({
                    ok: false,
                })
            );

            const result = await getComicMetadata("Batman #123.cbz", { useApi: false });

            expect(result.issueNumber).toBe(123);
        });

        it("should extract year from filename", async () => {
            readComicInfo.mockResolvedValue(null);
            global.fetch = vi.fn(() =>
                Promise.resolve({
                    ok: false,
                })
            );

            const result = await getComicMetadata("Batman (2023).cbz", { useApi: false });

            expect(result.year).toBe(2023);
        });

        it("should clean filename for lookup", async () => {
            readComicInfo.mockResolvedValue(null);

            const result = await getComicMetadata("Batman_#001_(2023)_[Digital].cbz", { useApi: false });

            expect(result.cleanedName).toBe("Batman");
        });
    });

    describe("Suggested Folder Structure", () => {
        it("should create Publisher/Series folder structure", async () => {
            const comicInfo = {
                series: "Batman",
                publisher: "DC Comics",
                number: 1,
            };

            readComicInfo.mockResolvedValue(comicInfo);

            const result = await getComicMetadata("batman001.cbz", {
                filePath: "/path/to/batman001.cbz",
            });

            expect(result.suggestedFolder).toBe("DC Comics/Batman");
        });

        it("should use Unsorted for unknown publishers", async () => {
            const comicInfo = {
                series: "Unknown Comic",
                number: 1,
            };

            readComicInfo.mockResolvedValue(comicInfo);

            const result = await getComicMetadata("unknown001.cbz", {
                filePath: "/path/to/unknown001.cbz",
            });

            expect(result.suggestedFolder).toBe("Unsorted/Unknown Comic");
        });
    });

    describe("Batch Metadata Processing", () => {
        it("should process multiple files", async () => {
            const { batchGetMetadata } = await import("../src/services/metadata.js");

            readComicInfo.mockResolvedValue(null);
            global.fetch = vi.fn(() =>
                Promise.resolve({
                    ok: false,
                })
            );

            const files = ["/path/to/batman001.cbz", "/path/to/superman001.cbz", "/path/to/spiderman001.cbz"];

            const results = await batchGetMetadata(files, { useApi: false });

            expect(results).toHaveLength(3);
            expect(results[0].originalFilename).toBe("batman001.cbz");
            expect(results[1].originalFilename).toBe("superman001.cbz");
            expect(results[2].originalFilename).toBe("spiderman001.cbz");
        });
    });
});
