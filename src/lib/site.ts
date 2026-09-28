// Verified public facts about the business (sparks.com.au + its own JSON-LD, 28 Sep 2026).
// AI content steps are grounded ONLY in these facts plus whatever the owner types in.
export const BUSINESS = {
  name: "F. Sparks & Sons",
  address: "80 Cowie St, North Geelong VIC 3215",
  phone: "(03) 5278 1713",
  email: "sales@sparks.com.au",
  website: "https://www.sparks.com.au",
  since: 1968,
  lat: -38.10492,
  lng: 144.34584,
  hours: "Mon–Fri 8:30am–5:00pm · Sat 8:30am–12:00pm",
  services: [
    "Custom trailer fabrication",
    "Trailer repairs & servicing",
    "Towbar supply & installation (Hayman Reese stockist)",
    "Weight distribution hitches",
    "Brake controllers",
    "Caravan repairs & maintenance",
    "Caravan, trailer, boat & 4WD parts",
  ],
  serviceArea: ["Geelong", "Bellarine Peninsula", "Surf Coast", "Melbourne"],
};

export const NAV = [
  { href: "/", label: "Overview" },
  { href: "/insights", label: "Why we're not in Maps" },
  { href: "/visibility", label: "Maps Rank Grid" },
  { href: "/keywords", label: "Keywords" },
  { href: "/site-health", label: "Website Health" },
  { href: "/reviews", label: "Reviews" },
  { href: "/content", label: "Posts & Photos" },
  { href: "/leads", label: "Lead Finder" },
  { href: "/settings", label: "Settings" },
] as const;

// Keywords the owner actually cares about (from her email + Thryv's tracked list).
export const DEFAULT_KEYWORDS = [
  "trailer manufacturers geelong",
  "towbars geelong",
  "tow bars geelong",
  "trailer repairs geelong",
  "custom trailers geelong",
  "caravan repairs geelong",
  "trailer parts geelong",
  "towing weight distribution hitch geelong",
  "towing equipment suppliers geelong",
  "brake controller installation geelong",
];

// Lead Finder defaults — B2B buyers of trailers, towbars and parts around Geelong.
// Everything here is editable in the portal before a run.
export const LEAD_CATEGORIES: { label: string; variants: string[] }[] = [
  { label: "Caravan dealer", variants: ["caravan dealer", "caravan sales"] },
  { label: "Equipment / plant hire", variants: ["equipment hire", "plant hire"] },
  { label: "Landscaping business", variants: ["landscaping company", "landscaper"] },
  { label: "Earthmoving contractor", variants: ["earthmoving contractor", "excavation contractor"] },
  { label: "Boat dealer", variants: ["boat dealer", "boat sales"] },
  { label: "4WD accessories", variants: ["4wd accessories", "4x4 shop"] },
  { label: "Builder", variants: ["builder", "building company"] },
  { label: "Farm supplies", variants: ["farm supplies", "rural supplies"] },
  { label: "Trailer hire", variants: ["trailer hire", "trailer rental"] },
];

export const LEAD_SUBURBS = ["North Geelong", "Geelong", "Geelong West", "Corio", "Norlane", "Bell Park", "Lara"];

// Outward rings, used only if the chosen suburbs don't reach the target count.
export const LEAD_RINGS: string[][] = [
  ["Belmont", "Grovedale", "Waurn Ponds", "Highton", "Newtown", "Moolap"],
  ["Leopold", "Drysdale", "Ocean Grove", "Torquay", "Armstrong Creek", "Bannockburn"],
  ["Werribee", "Hoppers Crossing", "Winchelsea", "Colac", "Queenscliff", "Anglesea"],
];

export const FRANCHISE_BRANDS = [
  "jayco", "kennards", "coates", "repco", "supercheap", "autobarn", "arb", "tjm", "ironman 4x4",
  "bunnings", "mitre 10", "home timber", "total tools", "u-haul", "hertz", "thrifty", "budget", "sydney tools",
];

export const LEAD_COLUMNS = [
  "business_name", "category", "suburb_area", "address", "business_phone", "phone_verified_on_own_site",
  "business_email", "website", "google_rating", "google_reviews", "decision_maker_name", "decision_maker_role",
  "decision_maker_direct_mobile", "decision_maker_shared_with_other_listing", "decision_maker_source",
  "business_size_estimate", "size_basis", "maps_search_query",
] as const;
