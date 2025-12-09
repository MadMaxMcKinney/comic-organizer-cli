# 📚 Comic Organizer

An interactive CLI application for organizing your digital comic collection. Supports `.cbr`, `.cbz`, `.pdf`, and `.epub` files.

## Features

- **🤖 Automatic Organization**: Analyzes filenames to detect publishers, series, and issue numbers. Uses pattern matching and optional Google Books API lookup.
- **📋 Manual Organization**: Use a JSON configuration file with regex patterns to define your own folder structure.
- **🔍 Preview Mode**: See exactly what will happen before any files are moved.
- **📁 Nested Folders**: Create deep folder hierarchies (Publisher/Series/Sub-series).
- **🎨 Beautiful CLI**: Color-coded output with progress indicators.

## Installation

```bash
# Clone or navigate to the project directory
cd comic-organizer

# Install dependencies
npm install

# Run the application
npm start

# Or link it globally
npm link
comic-organizer
```

## Usage

Run the application and follow the interactive prompts:

```bash
npm start
```

You'll be presented with options to:
1. **Automatic Organization** - Let the app analyze filenames and organize automatically
2. **Manual Organization** - Use your custom filters.json configuration
3. **Help** - Learn more about each option

### Example Session

```
═══════════════════════════════════════════════════════════
  📚 COMIC ORGANIZER
═══════════════════════════════════════════════════════════

? How would you like to organize your comics?
  🤖 Automatic - Analyze filenames and look up metadata
  📋 Manual - Use a JSON filter configuration file
  ❓ Help - Learn more about each option
  👋 Exit

? Enter the source directory containing comic files: ./downloads
ℹ Found 47 comic files in this directory

? Enter the destination directory for organized comics: ./comics

? Run in preview mode? (no files will be moved) Yes

▸ Organization Plan (8 folders)
────────────────────────────────
  📁 Marvel/Spider-Man (12 files)
  📁 Marvel/X-Men (8 files)
  📁 DC Comics/Batman (15 files)
  📁 Image/Invincible (7 files)
  ...
```

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

## Configuration Options

### Automatic Mode Options
- **Use Google Books API**: Enable/disable API lookups for better metadata
- **Preview Mode**: Show what would happen without moving files

### Manual Mode Options
- **Include Unmatched**: Move files that don't match any filter to "_Unmatched" folder
- **Preview Mode**: Show what would happen without moving files

## Supported File Types

`.cbr`, `.cbz`, `.pdf`, `.epub` are the only supported file types.


## Example Filter Configurations

### By Publisher Only
```json
{
  "filters": [
    { "name": "Marvel", "pattern": "marvel" },
    { "name": "DC", "pattern": "dc comics|detective comics" },
    { "name": "Image", "pattern": "image comics" }
  ]
}
```

### By Year
```json
{
  "filters": [
    { "name": "2024", "pattern": "2024|\\(2024\\)" },
    { "name": "2023", "pattern": "2023|\\(2023\\)" },
    { "name": "Older", "pattern": "20[0-2][0-2]|19\\d{2}" }
  ]
}
```

### By Format
```json
{
  "filters": [
    { "name": "Trade Paperbacks", "pattern": "tpb|trade|vol\\.?\\s*\\d+" },
    { "name": "Single Issues", "pattern": "#\\d+|issue\\s*\\d+" },
    { "name": "Omnibus", "pattern": "omnibus|omni" }
  ]
}
```

## License

MIT

