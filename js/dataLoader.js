// dataLoader.js — Load and cache data.json
const FALLBACK = {
  BRANDABLE_PREFIX: ["my", "go", "get", "try", "the", "neo", "meta", "ultra", "hyper", "super", "auto", "pro", "eco", "bit", "dig", "net", "web", "app", "bot", "dev"],
  BRANDABLE_SUFFIX: ["tv", "co", "ly", "hq", "hub", "lab", "box", "now", "app", "pro", "io", "ai", "ify", "ster", "flow", "sync", "base", "core", "nest", "ware", "works", "labs", "tech"],
  BRANDABLE_BOTH: ["my", "go", "tv", "co", "app", "pro", "hub", "lab", "box", "now", "web", "net", "tech", "cloud", "smart", "digital", "online", "media", "data", "code"],
  GEO_DOMAINS_DATA: {
    "us-cities": { "newyork": 8336817, "losangeles": 3979576, "chicago": 2693976, "houston": 2320268, "phoenix": 1680992, "philadelphia": 1584064, "sanantonio": 1547253, "sandiego": 1423851, "dallas": 1343573, "austin": 978908, "miami": 467963, "seattle": 753675, "denver": 727211, "boston": 694583, "atlanta": 498715, "lasvegas": 646790, "portland": 652503, "sanfrancisco": 881549, "nashville": 689447, "charlotte": 897720, "detroit": 670031, "minneapolis": 429954, "tampa": 399700, "orlando": 307573 },
    "us-states": { "California": 39610000, "Texas": 30100000, "Florida": 22200000, "NewYork": 19450000, "Pennsylvania": 12800000, "Illinois": 12670000, "Ohio": 11690000, "Georgia": 10620000, "NorthCarolina": 10440000, "Michigan": 9990000, "Arizona": 7280000, "Massachusetts": 6950000, "Washington": 7620000, "Colorado": 5760000, "Tennessee": 6830000 },
    "uk-cities": { "London": 8907918, "Birmingham": 1153717, "Manchester": 547627, "Leeds": 793139, "Glasgow": 633120, "Liverpool": 494814, "Sheffield": 584036, "Edinburgh": 524930, "Bristol": 463377, "Cardiff": 364248 },
    "canada-cities": { "Toronto": 2731571, "Montreal": 1704694, "Vancouver": 631486, "Calgary": 1306784, "Edmonton": 972223, "Ottawa": 994837, "Winnipeg": 705244, "QuebecCity": 531902, "Hamilton": 536911, "Victoria": 367770 },
    "australia-cities": { "Sydney": 5259764, "Melbourne": 4976157, "Brisbane": 2514184, "Perth": 2086622, "Adelaide": 1345563, "GoldCoast": 679127, "Canberra": 426711, "Newcastle": 322278, "Hobart": 233042, "Cairns": 153075 }
  },
  KEYWORD_CATEGORIES: {
    "Tech": ["cloud", "data", "code", "dev", "api", "server", "stack", "hub", "lab", "tech", "soft", "app", "web", "net", "sys", "bot", "ai", "ml"],
    "Artificial Intelligence": ["ai", "gpt", "llm", "neural", "chatbot", "copilot", "openai", "transformer", "algorithm", "model", "deep", "learn", "smart", "brain", "cognitive", "mind", "logic"],
    "Crypto": ["nft", "defi", "coin", "token", "blockchain", "bitcoin", "ethereum", "crypto", "chain", "hash", "mint", "swap", "dex", "yield", "stake", "vault", "ledger", "node"],
    "Finance": ["pay", "cash", "fund", "bank", "invest", "loan", "credit", "wealth", "trade", "capital", "finance", "money", "asset", "budget", "save", "wallet", "portfolio"],
    "RealEstate": ["home", "house", "realty", "estate", "broker", "property", "apartment", "condo", "land", "build", "mortgage", "rent", "lease", "keys", "door"],
    "Health & Fitness": ["gym", "yoga", "fitness", "workout", "nutrition", "health", "wellness", "care", "med", "vital", "life", "cure", "therapy", "body", "fit", "active"],
    "Gaming": ["game", "gamer", "loot", "rank", "arena", "dragon", "zombie", "quest", "pixel", "play", "esport", "stream", "guild", "clan", "boss", "level", "xp"],
    "Travel": ["fly", "jet", "trip", "tour", "hotel", "voyage", "travel", "journey", "escape", "explore", "wander", "roam", "destination", "route", "nomad", "go"]
  }
};

let cache = null;

export async function loadData() {
  if (cache) return cache;
  try {
    const res = await fetch('assets/data/data.json');
    if (!res.ok) throw new Error('Network error');
    cache = await res.json();
    return cache;
  } catch (e) {
    console.warn('dataLoader: using fallback data');
    cache = FALLBACK;
    return FALLBACK;
  }
}

export function getData() {
  return cache || FALLBACK;
}

export function getCPCMap() {
  return {
    lawyer: 95, attorney: 92, insurance: 90, mortgage: 88, rehab: 85, treatment: 82,
    trading: 80, crypto: 78, finance: 75, realestate: 72, doctor: 70, dentist: 68,
    roofing: 65, plumber: 60, contractor: 58, restaurant: 45, cleaning: 42,
    tech: 65, cloud: 60, data: 55, ai: 70, software: 62, marketing: 55
  };
}
