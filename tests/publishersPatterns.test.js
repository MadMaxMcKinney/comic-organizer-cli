import { describe, it, expect } from "vitest";
import { PUBLISHERS, PUBLISHER_ALIASES } from "../src/patterns/publishersPatterns.js";

describe("Publishers Patterns", () => {
    describe("PUBLISHERS object", () => {
        it("should have expected major publishers", () => {
            expect(PUBLISHERS.MARVEL).toBe("Marvel");
            expect(PUBLISHERS.DC).toBe("DC Comics");
            expect(PUBLISHERS.IMAGE).toBe("Image");
            expect(PUBLISHERS.DARK_HORSE).toBe("Dark Horse");
            expect(PUBLISHERS.IDW).toBe("IDW");
        });

        it("should have all publishers as non-empty strings", () => {
            Object.values(PUBLISHERS).forEach((publisher) => {
                expect(publisher).toBeTruthy();
                expect(typeof publisher).toBe("string");
                expect(publisher.length).toBeGreaterThan(0);
            });
        });

        it("should have unique publisher values", () => {
            const values = Object.values(PUBLISHERS);
            const uniqueValues = new Set(values);
            expect(values.length).toBe(uniqueValues.size);
        });
    });

    describe("PUBLISHER_ALIASES", () => {
        it("should map common variations to canonical names", () => {
            expect(PUBLISHER_ALIASES["marvel"]).toBe("Marvel");
            expect(PUBLISHER_ALIASES["marvel comics"]).toBe("Marvel");
            expect(PUBLISHER_ALIASES["dc"]).toBe("DC Comics");
            expect(PUBLISHER_ALIASES["dc comics"]).toBe("DC Comics");
            expect(PUBLISHER_ALIASES["dark horse"]).toBe("Dark Horse");
            expect(PUBLISHER_ALIASES["dark horse comics"]).toBe("Dark Horse");
        });

        it("should have all lowercase keys", () => {
            Object.keys(PUBLISHER_ALIASES).forEach((key) => {
                expect(key).toBe(key.toLowerCase());
            });
        });

        it("should map to valid publishers from PUBLISHERS object", () => {
            const publisherValues = Object.values(PUBLISHERS);
            Object.values(PUBLISHER_ALIASES).forEach((alias) => {
                expect(publisherValues).toContain(alias);
            });
        });

        it("should not have duplicate aliases", () => {
            const keys = Object.keys(PUBLISHER_ALIASES);
            const uniqueKeys = new Set(keys);
            expect(keys.length).toBe(uniqueKeys.size);
        });
    });

    describe("Integration", () => {
        it("should allow normalizing publisher names via aliases", () => {
            const testCases = [
                { input: "marvel comics", expected: "Marvel" },
                { input: "dc comics", expected: "DC Comics" },
                { input: "image comics", expected: "Image" },
                { input: "boom! studios", expected: "BOOM! Studios" },
            ];

            testCases.forEach(({ input, expected }) => {
                const normalized = PUBLISHER_ALIASES[input.toLowerCase()];
                expect(normalized).toBe(expected);
            });
        });
    });
});
