/**
 * Comic publisher data
 */

// Common comic publishers
export const PUBLISHERS_PATTERNS = ["Marvel", "DC Comics", "DC", "Image", "Dark Horse", "IDW", "Vertigo", "Boom! Studios", "Dynamite", "Valiant", "Oni Press", "Archie", "Titan", "AWA", "AfterShock"];

// Publisher name normalization (map variations to canonical names). Keep lower case keys.
export const PUBLISHER_ALIASES = {
    "dark horse comics": "Dark Horse",
    "dark horse": "Dark Horse",
    "dc comics": "DC Comics",
    dc: "DC Comics",
    "marvel comics": "Marvel",
    marvel: "Marvel",
    "image comics": "Image",
    image: "Image",
    "boom! studios": "BOOM! Studios",
    "boom studios": "BOOM! Studios",
    boom: "BOOM! Studios",
    "idw publishing": "IDW",
    idw: "IDW",
};
