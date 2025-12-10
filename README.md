# Comic Organizer CLI

<img width="100%" height="auto" alt="CleanShot 2025-12-09 at 20 47 44@2x" src="https://github.com/user-attachments/assets/b64b44ae-ee38-4724-8721-f080a92c82d7" />

----

An interactive CLI application for organizing your digital comic collection. Supports `.cbr`, `.cbz`, `.pdf`, and `.epub` files.

## Features

- **🤖 Automatically organize your comics**: Analyzes filenames to detect publishers, series, and issue numbers. Uses pattern matching and optional Google Books API lookup.
- **📋 Manually organize via filters**: Use a JSON configuration file with regex filtering patterns to define your own folder and sub-folder structure.
- **📦 Flatten folder hierarchy**: Move all comics from subdirectories to the root folder.
- **⚙️ Post-process results**: Run useful operations on a directory, like renaming files based on metadata or combining duplicate/similar folders.
- **🔍 Operate safely**: See exactly what will happen before any files are moved or changed.
- **🎨 Enjoy a beautiful CLI**: Color-coded output with progress indicators and interactive inputs.

## Installation

```bash
# Clone or navigate to the project directory
cd comic-organizer

# Install dependencies
npm install

# Run the application
npm start
```

## Usage

The program will only discover files in the root of the chosen directory (chosen during the prompts), this way it avoids processing files in folders that are already organized. After running the organization process, all files will be moved into respective folders.

Run the application and follow the interactive prompts:

```bash
npm start
```

### Example Session

```
═══════════════════════════════════════════════════════════
  📚 COMIC ORGANIZER
═══════════════════════════════════════════════════════════

? How would you like to organize your comics?
  🤖 Automatic - Analyze filenames and look up metadata
  📋 Manual - Use a JSON filter configuration file
  📦 Flatten hierarchy - Move all comics to root folder
  ⚙️ Post-processing only - Run post-processing on a directory
  ❓ Help - Learn more about each option
  👋 Exit

? Enter the source directory containing comic files: ./downloads
ℹ Found 47 comic files in this directory

? Enter the destination directory for organized comics: ./comics

? Preview output first? (no files will be moved) Yes

▸ Organization Plan (8 folders)
────────────────────────────────
  📁 Marvel/Spider-Man (12 files)
  📁 Marvel/X-Men (8 files)
  📁 DC Comics/Batman (15 files)
  📁 Image/Invincible (7 files)
  ...
```

## Automatic Organization

The automatic organizer analyzes filenames to detect publishers, series, and issue numbers. It also fetches metadata from the Google Books API to improve accuracy. It will try to create a sensible folder structure based on the detected information, including an initial pass at establishing series folders.

Having accurate filenames greatly improves the results. The more consistent your filenames are, the better the organization will be. That said, the automatic organizer is designed to handle a variety of naming conventions and inconsistencies.

### Static Pattern Matching

To supplement the automatic organization via fetching metadata, the system will also use pattern matching on filenames/fetched metadata to detect publishers and series. This helps catch files that may not have good metadata available. Pattern matching is case-insensitive and always has priority over fetched metadata.

Want to add your own patterns? You can customize the static patterns used by editing the `seriesPatterns.js` and `publisherPatterns.js` files in the project `src/patterns` directory. This would be a great way to contribute back if you have patterns for lesser-known series or publishers!


## Manual Organization with filters.json

Create a `filters.json` file to define your organization rules:

```json
{
  "filters": [
    {
      "name": "Marvel",
      "pattern": "marvel|spider-man|x-men|avengers",
      "filters": [
        {
          "name": "Spider-Man",
          "pattern": "spider-man|spiderman",
          "filters": [
            { "name": "Amazing Spider-Man", "pattern": "amazing\\s*spider" },
            { "name": "Ultimate Spider-Man", "pattern": "ultimate\\s*spider" }
          ]
        },
        { "name": "X-Men", "pattern": "x-men|x-force|wolverine" }
      ]
    },
    {
      "name": "DC Comics",
      "pattern": "dc|batman|superman|wonder woman"
    }
  ]
}
```

### Filter Structure

Each filter has:
- **name**: The folder name to create
- **pattern**: A regex pattern to match filenames (case-insensitive)
- **filters** (optional): Sub-filters that only match within parent results

### How Filtering Works

1. Files are matched against top-level filters first
2. Matched files are then passed to sub-filters
3. If a file matches a parent but no sub-filter, it goes in the parent folder
4. Files can only match one filter (first match wins at each level)

### Example Result

Given files:
- `Amazing Spider-Man 001.cbz`
- `Spider-Man 2099 005.cbz`
- `Batman 123.cbr`

Result structure:
```
organized-comics/
├── Marvel/
│   └── Spider-Man/
│       ├── Amazing Spider-Man/
│       │   └── Amazing Spider-Man 001.cbz
│       └── Spider-Man 2099 005.cbz
└── DC Comics/
    └── Batman 123.cbr
```

### Example Filter Configurations

#### By Publisher Only
```json
{
  "filters": [
    { "name": "Marvel", "pattern": "marvel" },
    { "name": "DC", "pattern": "dc comics|detective comics" },
    { "name": "Image", "pattern": "image comics" }
  ]
}
```

#### By Year
```json
{
  "filters": [
    { "name": "2024", "pattern": "2024|\\(2024\\)" },
    { "name": "2023", "pattern": "2023|\\(2023\\)" },
    { "name": "Older", "pattern": "20[0-2][0-2]|19\\d{2}" }
  ]
}
```

#### By Format
```json
{
  "filters": [
    { "name": "Trade Paperbacks", "pattern": "tpb|trade|vol\\.?\\s*\\d+" },
    { "name": "Single Issues", "pattern": "#\\d+|issue\\s*\\d+" },
    { "name": "Omnibus", "pattern": "omnibus|omni" }
  ]
}
```

## Post-Processing

After organizing your comics, you can run post-processing operations. These are also available as a standalone mode to process any directory.

### Consolidate Folders

Automatically detect and merge duplicate or similar folders based on folder name similarity. This is useful when the same series ends up in multiple folders due to naming variations.

**Example:**
```
Found potential duplicates:
  📁 Spider-Man (12 files) ↔️ Spiderman (5 files) - 95% similar
  📁 X-Men (8 files) ↔️ X Men (3 files) - 90% similar
  📁 Batman (15 files) ↔️ Batman - The Dark Knight (4 files) - 75% similar

? Select folders to consolidate:
  ✓ Spider-Man & Spiderman
  ✓ X-Men & X Men
  ○ Batman & Batman - The Dark Knight

? Enter the name for the consolidated folder: Spider-Man
```

### Rename Files

Automatically rename files based on extracted metadata (including fetched metadata). Choose from multiple format options:

- **Smart Format** (handles TPB, Omnibus, One-shots): 
  - TPB: `Spider-Man Vol 01 2023.cbz`
  - Omnibus: `Batman Omnibus Vol 2 2024.cbz`
  - One-shot: `Superman One-Shot 2024.cbz`
  - Regular issue: `X-Men 001 2023.cbz`
- **Publisher - Series - Issue #123 (Year)**: `Marvel - Spider-Man - Issue #001 (2023).cbz`
- **Series - #123 (Year)**: `Spider-Man - #001 (2023).cbz`
- **Series #123**: `Spider-Man #001.cbz`
- **Publisher - Series (Year)**: `Marvel - Spider-Man (2023).cbz`
- **Series_Issue_Year**: `Spider-Man_001_2023.cbz`

## Supported File Types

`.cbr`, `.cbz`, `.pdf`, `.epub` are the only supported file types.

## License

MIT

