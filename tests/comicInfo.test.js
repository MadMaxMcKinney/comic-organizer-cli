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

    describe("Real-world XML parsing", () => {
        it("should parse ComicInfo.xml with xmlns attributes (like from Comixology)", () => {
            const xml = `<?xml version="1.0"?>
<ComicInfo xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <Series>Geiger 80-Page Giant</Series>
  <Number>1</Number>
  <Web>https://www.comixology.com/Geiger-80-Page-Giant-1/digital-comic/966286</Web>
  <Summary>MAD GHOST COMICS presents a MONSTROUS 80 PAGES of all-new stories featuring GEIGER</Summary>
  <Notes>Scraped metadata from Comixology [CMXDB966286], [ASINB09F8PCSM5]</Notes>
  <Publisher>Image</Publisher>
  <Genre>Action/Adventure, Science Fiction</Genre>
  <PageCount>77</PageCount>
  <LanguageISO>en</LanguageISO>
</ComicInfo>`;

            const info = parseComicInfo(xml);

            expect(info).not.toBeNull();
            expect(info.series).toBe("Geiger 80-Page Giant");
            expect(info.number).toBe(1);
            expect(info.publisher).toBe("Image");
            expect(info.pageCount).toBe(77);
            expect(info.languageISO).toBe("en");
            expect(info.web).toBe("https://www.comixology.com/Geiger-80-Page-Giant-1/digital-comic/966286");
        });

        it("should handle XML with encoded HTML entities", () => {
            const xml = `<?xml version="1.0"?>
<ComicInfo>
    <Series>Batman &amp; Robin</Series>
    <Summary>The Dynamic Duo's greatest adventure &lt;continues&gt;</Summary>
    <Publisher>DC Comics</Publisher>
</ComicInfo>`;

            const info = parseComicInfo(xml);

            expect(info.series).toBe("Batman & Robin");
            expect(info.summary).toContain("<continues>");
        });

        it("should parse all supported fields from real-world example", () => {
            const xml = `<?xml version="1.0"?>
<ComicInfo>
    <Series>Amazing Spider-Man</Series>
    <Number>800</Number>
    <Volume>5</Volume>
    <Title>Legacy</Title>
    <Summary>A special anniversary issue!</Summary>
    <Notes>Digital release</Notes>
    <Publisher>Marvel Comics</Publisher>
    <Imprint>Marvel</Imprint>
    <Genre>Superhero</Genre>
    <Web>https://marvel.com</Web>
    <PageCount>96</PageCount>
    <LanguageISO>en</LanguageISO>
    <Format>Series</Format>
    <Year>2018</Year>
    <Month>5</Month>
    <Day>30</Day>
    <Writer>Dan Slott</Writer>
    <Penciller>Stuart Immonen</Penciller>
    <Inker>Wade Von Grawbadger</Inker>
    <Colorist>Marte Gracia</Colorist>
    <Letterer>Joe Caramagna</Letterer>
    <CoverArtist>Alex Ross</CoverArtist>
    <Editor>Nick Lowe</Editor>
    <StoryArc>Go Down Swinging</StoryArc>
    <SeriesGroup>Spider-Verse</SeriesGroup>
    <AlternateSeries>ASM</AlternateSeries>
    <AlternateNumber>63</AlternateNumber>
    <AgeRating>Everyone 10+</AgeRating>
</ComicInfo>`;

            const info = parseComicInfo(xml);

            expect(info.series).toBe("Amazing Spider-Man");
            expect(info.number).toBe(800);
            expect(info.volume).toBe(5);
            expect(info.title).toBe("Legacy");
            expect(info.publisher).toBe("Marvel Comics");
            expect(info.imprint).toBe("Marvel");
            expect(info.year).toBe(2018);
            expect(info.month).toBe(5);
            expect(info.day).toBe(30);
            expect(info.writer).toBe("Dan Slott");
            expect(info.penciller).toBe("Stuart Immonen");
            expect(info.inker).toBe("Wade Von Grawbadger");
            expect(info.colorist).toBe("Marte Gracia");
            expect(info.letterer).toBe("Joe Caramagna");
            expect(info.coverArtist).toBe("Alex Ross");
            expect(info.editor).toBe("Nick Lowe");
            expect(info.summary).toBe("A special anniversary issue!");
            expect(info.storyArc).toBe("Go Down Swinging");
            expect(info.seriesGroup).toBe("Spider-Verse");
            expect(info.alternateSeries).toBe("ASM");
            expect(info.alternateNumber).toBe(63); // XML parser converts to number
            expect(info.format).toBe("Series");
            expect(info.ageRating).toBe("Everyone 10+");
            expect(info.web).toBe("https://marvel.com");
            expect(info.pageCount).toBe(96);
            expect(info.languageISO).toBe("en");
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
