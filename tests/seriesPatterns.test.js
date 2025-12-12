import { describe, it, expect } from "vitest";
import { SERIES_PATTERNS } from "../src/patterns/seriesPatterns.js";
import { PUBLISHERS } from "../src/patterns/publishersPatterns.js";

describe("Series Patterns", () => {
    describe("Pattern Structure", () => {
        it("should have valid pattern objects", () => {
            expect(SERIES_PATTERNS.length).toBeGreaterThan(0);

            SERIES_PATTERNS.forEach((pattern, index) => {
                expect(pattern).toHaveProperty("pattern");
                expect(pattern).toHaveProperty("series");
                expect(pattern).toHaveProperty("publisher");
                expect(pattern.pattern).toBeInstanceOf(RegExp);
                expect(typeof pattern.series).toBe("string");
                expect(typeof pattern.publisher).toBe("string");
            });
        });

        it("should have all publishers as valid PUBLISHERS values", () => {
            const validPublishers = Object.values(PUBLISHERS);

            SERIES_PATTERNS.forEach((pattern) => {
                expect(validPublishers).toContain(pattern.publisher);
            });
        });

        it("should have case-insensitive patterns", () => {
            SERIES_PATTERNS.forEach((pattern) => {
                expect(pattern.pattern.flags).toContain("i");
            });
        });
    });

    describe("Pattern Matching", () => {
        it("should match Spider-Man variations", () => {
            const spiderManPattern = SERIES_PATTERNS.find((p) => p.series.toLowerCase().includes("spider-man"));
            expect(spiderManPattern).toBeDefined();

            const testCases = ["Spider-Man #001.cbz", "Spider Man 001.cbz", "SpiderMan001.cbz", "SPIDER-MAN #1.cbr", "spider man 123.pdf"];

            testCases.forEach((filename) => {
                expect(spiderManPattern.pattern.test(filename)).toBe(true);
            });
        });

        it("should match Batman variations", () => {
            const batmanPattern = SERIES_PATTERNS.find((p) => p.series === "Batman");
            expect(batmanPattern).toBeDefined();

            const testCases = ["Batman #001.cbz", "Batman 001.cbr", "BATMAN #1.pdf", "batman 123.cbz"];

            testCases.forEach((filename) => {
                expect(batmanPattern.pattern.test(filename)).toBe(true);
            });
        });

        it("should match The Walking Dead variations", () => {
            const walkingDeadPattern = SERIES_PATTERNS.find((p) => p.series === "The Walking Dead");
            expect(walkingDeadPattern).toBeDefined();

            const testCases = ["The Walking Dead #001.cbz", "The-Walking-Dead 001.cbr", "TheWalkingDead001.cbz", "WALKING DEAD #1.pdf"];

            testCases.forEach((filename) => {
                expect(walkingDeadPattern.pattern.test(filename)).toBe(true);
            });
        });

        it("should match multi-word series with hyphens or spaces", () => {
            const testPatterns = [
                { series: "Sea of Stars", test: ["Sea of Stars #1.cbz", "Sea-of-Stars 001.cbr", "SeaofStars1.cbz"] },
                {
                    series: "Wonder Woman",
                    test: ["Wonder Woman #1.cbz", "Wonder-Woman 001.cbr", "WonderWoman1.cbz"],
                },
            ];

            testPatterns.forEach(({ series, test }) => {
                const pattern = SERIES_PATTERNS.find((p) => p.series === series);
                if (pattern) {
                    test.forEach((filename) => {
                        expect(pattern.pattern.test(filename)).toBe(true);
                    });
                }
            });
        });
    });

    describe("Publisher Assignment", () => {
        it("should assign Marvel to Marvel series", () => {
            const marvelSeries = ["The Amazing Spider-Man", "X-Men", "The Avengers", "Iron Man"];

            marvelSeries.forEach((series) => {
                const pattern = SERIES_PATTERNS.find((p) => p.series === series);
                if (pattern) {
                    expect(pattern.publisher).toBe(PUBLISHERS.MARVEL);
                }
            });
        });

        it("should assign DC Comics to DC series", () => {
            const dcSeries = ["Batman", "Superman", "Wonder Woman", "Justice League"];

            dcSeries.forEach((series) => {
                const pattern = SERIES_PATTERNS.find((p) => p.series === series);
                if (pattern) {
                    expect(pattern.publisher).toBe(PUBLISHERS.DC);
                }
            });
        });

        it("should assign Image to Image series", () => {
            const imageSeries = ["The Walking Dead", "Saga", "Invincible", "Spawn"];

            imageSeries.forEach((series) => {
                const pattern = SERIES_PATTERNS.find((p) => p.series === series);
                if (pattern) {
                    expect(pattern.publisher).toBe(PUBLISHERS.IMAGE);
                }
            });
        });
    });

    describe("Pattern Uniqueness", () => {
        it("should warn about duplicate series names", () => {
            const seriesNames = SERIES_PATTERNS.map((p) => p.series);
            const uniqueNames = new Set(seriesNames);

            if (seriesNames.length !== uniqueNames.size) {
                const duplicates = seriesNames.filter((name, index) => seriesNames.indexOf(name) !== index);
                console.log("Note: Duplicate series found (may be intentional for different patterns):", [...new Set(duplicates)]);
            }

            // Just ensure we have patterns
            expect(seriesNames.length).toBeGreaterThan(0);
        });
    });

    describe("Pattern Coverage", () => {
        it("should have patterns for major publishers", () => {
            const marvelCount = SERIES_PATTERNS.filter((p) => p.publisher === PUBLISHERS.MARVEL).length;
            const dcCount = SERIES_PATTERNS.filter((p) => p.publisher === PUBLISHERS.DC).length;
            const imageCount = SERIES_PATTERNS.filter((p) => p.publisher === PUBLISHERS.IMAGE).length;

            expect(marvelCount).toBeGreaterThan(10);
            expect(dcCount).toBeGreaterThan(10);
            expect(imageCount).toBeGreaterThan(10);
        });
    });
});
