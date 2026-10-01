// Shapes returned by the n8n webhooks (see n8n/CONTRACT.md).

export type Settings = {
  businessNameOnGoogle: string;
  googlePlaceId: string;
  gscProperty: string;
  trackedKeywords: string[];
  facebookPageName: string;
  reviewMessage: string;
  extraFacts: string;
  demoAccountLabel: string; // e.g. "Demo: Truetel's own Google profile" — shown on every live card while demoing
};

export type ActivityItem = { id: number | string; createdAt: string; kind: string; summary: string; actor?: string };

export type LeadJobStatus = "queued" | "scraping" | "verifying" | "extracting" | "done" | "failed" | "interrupted";

export type LeadJob = {
  jobId: string;
  createdAt: string;
  status: LeadJobStatus;
  label: string;
  target: number;
  queriesTotal: number;
  queriesDone: number;
  scraped: number;
  unique: number;
  phoneVerified: number;
  withEmail: number;
  withDecisionMaker: number;
  withDirectMobile: number;
  widenedInto: string[];
  widenReason?: string;
  message?: string;
};

export type LeadRow = Record<string, string>;

export type GridPoint = {
  lat: number;
  lng: number;
  rank: number | null; // null = not in the top N results
  top: string[]; // top 3 business names at this point
};

export type GridJob = {
  jobId: string;
  createdAt: string;
  status: "queued" | "running" | "done" | "failed";
  keyword: string;
  businessName: string;
  gridSize: number;
  spacingKm: number;
  centerLat: number;
  centerLng: number;
  depth: number;
  points: GridPoint[];
  message?: string;
};

export type GscRow = { query: string; clicks: number; impressions: number; ctr: number; position: number };
export type GscResult = { property: string; startDate: string; endDate: string; syncedAt: string; rows: GscRow[] };

export type ContentPost = {
  id: string;
  createdAt: string;
  status: "draft" | "published" | "failed" | "partially_published";
  kind: string;
  platforms: string[];
  captions: Record<string, string>;
  imageUrl?: string;
  results?: Record<string, string>;
};

export type ReviewRequest = { id: string | number; createdAt: string; customerName: string; channel: "sms" | "email"; status: string };

export type Keyword = { keyword: string; family: string; score: number; reasons: string[]; seeds?: string[]; pinned?: boolean };
export type KeywordSet = {
  updatedAt?: string;
  tracked?: Keyword[];
  candidates?: Keyword[];
  brand?: string[];
  others?: string[];
  pinned?: string[];
  ignored?: string[];
  sources?: { autocomplete?: string; searchConsole?: string };
};

export type VisRow = {
  keyword: string;
  family: string;
  reasons: string[];
  mapRank: number | null;
  mapTop3: { title: string; type: string; rating: number | null; reviews: number | null }[];
  winningCategory: string;
  categoryMatch: boolean | null;
  categoryIsPrimary: boolean | null;
  mainWord: string;
  top3WithWordInName: number;
  top3AvgReviews: number | null;
  websiteRank: number | null;
  websiteClicks: number | null;
  websiteSource: string;
  error?: string;
};
export type VisCheck = {
  runId: string;
  checkedAt: string;
  location: string;
  status: string;
  searchesUsed: number;
  own: { title: string; types: string[]; primaryType: string; rating: number | null; reviews: number | null; address: string } | null;
  rows: VisRow[];
};
