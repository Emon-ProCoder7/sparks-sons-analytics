/** Colour for a Maps rank: green top 3, amber 4–10, red 11+, grey when not found. */
export function rankColor(rank: number | null) {
  if (rank === null) return "#9a9a9a";
  if (rank <= 3) return "#1f8a4c";
  if (rank <= 10) return "#b7791f";
  return "#c53030";
}
