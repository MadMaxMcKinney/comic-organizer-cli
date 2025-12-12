import { describe, it, expect } from "vitest";
import { readComicInfo, parseComicInfo } from "../src/services/comicInfo.js";

describe("ComicInfo Service", () => {
    describe("parseComicInfo (XML parsing)", () => {
        it("should parse valid ComicInfo.xml with all fields", () => {
            const xml = `<?xml version="1.0"?>
<ComicInfo>
    <Series>The Amazing Spider-Man</Series>
    <Number>1</Number>
    <Volume>1</Volume>
    <Title>Great Power</Title>
    <Publisher>Marvel Comics</Publisher>
    <Year>2023</Year>
    <Month>1</Month>
    <Writer>Stan Lee</Writer>
    <Penciller>Steve Ditko</Penciller>
    <Summary>The origin of Spider-Man</Summary>
    <StoryArc>Origin</StoryArc>
    <PageCount>32</PageCount>
</ComicInfo>`;

            const info = parseComicInfo(xml);

            expect(info.series).toBe("The Amazing Spider-Man");
            expect(info.number).toBe(1);
            expect(info.volume).toBe(1);
            expect(info.title).toBe("Great Power");
            expect(info.publisher).toBe("Marvel Comics");
            expect(info.year).toBe(2023);
            expect(info.writer).toBe("Stan Lee");
        });

        it("should parse ComicInfo.xml with minimal fields", () => {
            const xml = `<?xml version="1.0"?>
<ComicInfo>
    <Series>Batman</Series>
    <Number>1</Number>
    <Publisher>DC Comics</Publisher>
</ComicInfo>`;

            const info = parseComicInfo(xml);

            expect(info.series).toBe("Batman");
            expect(info.number).toBe(1);
            expect(info.publisher).toBe("DC Comics");
        });

        it("should handle decimal issue numbers", () => {
            const xml = `<?xml version="1.0"?>
<ComicInfo>
    <Series>Spider-Man</Series>
    <Number>1.5</Number>
    <Publisher>Marvel</Publisher>
</ComicInfo>`;

            const info = parseComicInfo(xml);

            expect(info.number).toBe(1.5);
        });

        it("should handle imprint field", () => {
            const xml = `<?xml version="1.0"?>
<ComicInfo>
    <Series>Sandman</Series>
    <Number>1</Number>
    <Publisher>DC Comics</Publisher>
    <Imprint>Vertigo</Imprint>
</ComicInfo>`;

            const info = parseComicInfo(xml);

            expect(info.imprint).toBe("Vertigo");
        });

        it("should handle multiple creators", () => {
            const xml = `<?xml version="1.0"?>
<ComicInfo>
    <Series>X-Men</Series>
    <Number>1</Number>
    <Writer>Chris Claremont</Writer>
    <Penciller>Jim Lee</Penciller>
    <Inker>Scott Williams</Inker>
    <Colorist>Joe Rosas</Colorist>
    <Letterer>Tom Orzechowski</Letterer>
    <CoverArtist>Jim Lee</CoverArtist>
</ComicInfo>`;

            const info = parseComicInfo(xml);

            expect(info.writer).toBe("Chris Claremont");
            expect(info.penciller).toBe("Jim Lee");
            expect(info.inker).toBe("Scott Williams");
            expect(info.colorist).toBe("Joe Rosas");
        });

        it("should handle story arc and series group", () => {
            const xml = `<?xml version="1.0"?>
<ComicInfo>
    <Series>Avengers</Series>
    <Number>1</Number>
    <StoryArc>Infinity War</StoryArc>
    <SeriesGroup>Marvel NOW!</SeriesGroup>
    <AlternateSeries>New Avengers</AlternateSeries>
</ComicInfo>`;

            const info = parseComicInfo(xml);

            expect(info.storyArc).toBe("Infinity War");
            expect(info.seriesGroup).toBe("Marvel NOW!");
            expect(info.alternateSeries).toBe("New Avengers");
        });

        it("should handle format field", () => {
            const xml = `<?xml version="1.0"?>
<ComicInfo>
    <Series>Batman</Series>
    <Number>1</Number>
    <Format>TPB</Format>
</ComicInfo>`;

            const info = parseComicInfo(xml);

            expect(info.format).toBe("TPB");
        });

        it("should parse empty ComicInfo", () => {
            const xml = `<?xml version="1.0"?>
<ComicInfo>
</ComicInfo>`;

            const info = parseComicInfo(xml);

            expect(info).toBeDefined();
            expect(info.series).toBeNull();
            expect(info.publisher).toBeNull();
        });
    });

    describe("ComicInfo Data Validation", () => {
        it("should handle missing optional fields gracefully", () => {
            const xml = `<?xml version="1.0"?>
<ComicInfo>
    <Series>Batman</Series>
</ComicInfo>`;

            const info = parseComicInfo(xml);

            expect(info.series).toBe("Batman");
            expect(info.number).toBeNull();
            expect(info.publisher).toBeNull();
        });

        it("should preserve special characters in text fields", () => {
            const xml = `<?xml version="1.0"?>
<ComicInfo>
    <Series>Y: The Last Man</Series>
    <Summary>A plague kills all males - except one &amp; his monkey</Summary>
</ComicInfo>`;

            const info = parseComicInfo(xml);

            expect(info.series).toBe("Y: The Last Man");
            expect(info.summary).toContain("&");
        });
    });

    describe("Edge Cases", () => {
        it("should handle non-XML input", () => {
            const notXml = "This is just plain text, not XML";

            const info = parseComicInfo(notXml);

            // parseComicInfo returns null if no ComicInfo element found
            expect(info).toBeNull();
        });

        it("should handle non-ComicInfo root element", () => {
            const xml = `<?xml version="1.0"?>
<SomeOtherRoot>
    <Series>Batman</Series>
</SomeOtherRoot>`;

            const info = parseComicInfo(xml);

            expect(info).toBeNull();
        });

        it("should return null for null input", () => {
            const info = parseComicInfo(null);
            expect(info).toBeNull();
        });
    });

    describe("readComicInfo integration", () => {
        it("should return null for unsupported file types", async () => {
            const result = await readComicInfo("/path/to/file.pdf");
            expect(result).toBeNull();
        });

        it("should return null for epub files", async () => {
            const result = await readComicInfo("/path/to/file.epub");
            expect(result).toBeNull();
        });

        it("should return null for non-existent files", async () => {
            const result = await readComicInfo("/path/to/nonexistent.cbz");
            expect(result).toBeNull();
        });
    });
});
