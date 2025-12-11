/**
 * Comic publisher data
 */

export const PUBLISHERS = {
    MARVEL: "Marvel",
    DC: "DC Comics",
    IMAGE: "Image",
    DARK_HORSE: "Dark Horse",
    IDW: "IDW",
    VERTIGO: "Vertigo",
    BOOM: "BOOM! Studios",
    VALIANT: "Valiant",
    ONI_PRESS: "Oni Press",
    ARCHIE: "Archie",
    TITAN: "Titan",
    AWA: "AWA",
    AFTERSHOCK: "AfterShock",
    WILDSTORM: "Wildstorm",
    MAD_CAVE: "Mad Cave",
    DYNAMITE: "Dynamite Entertainment",
};

// Publisher name normalization (map variations to canonical names). Keep lower case keys.
export const PUBLISHER_ALIASES = {
    "dark horse comics": PUBLISHERS.DARK_HORSE,
    "dark horse": PUBLISHERS.DARK_HORSE,
    "dc comics": PUBLISHERS.DC,
    dc: PUBLISHERS.DC,
    "marvel comics": PUBLISHERS.MARVEL,
    marvel: PUBLISHERS.MARVEL,
    "image comics": PUBLISHERS.IMAGE,
    image: PUBLISHERS.IMAGE,
    "boom! studios": PUBLISHERS.BOOM,
    "boom studios": PUBLISHERS.BOOM,
    boom: PUBLISHERS.BOOM,
    "idw publishing": PUBLISHERS.IDW,
    idw: PUBLISHERS.IDW,
    "mad cave studios": PUBLISHERS.MAD_CAVE,
    "mad cave comics": PUBLISHERS.MAD_CAVE,
    "dynamite comics": PUBLISHERS.DYNAMITE,
    dynamite: PUBLISHERS.DYNAMITE,
    "oni press": PUBLISHERS.ONI_PRESS,
    "wildstorm productions": PUBLISHERS.WILDSTORM,
};
