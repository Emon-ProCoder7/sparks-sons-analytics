"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { MapContainer, Marker, TileLayer, Tooltip } from "react-leaflet";
import type { GridPoint } from "@/lib/types";

export function rankColor(rank: number | null) {
  if (rank === null) return "#9a9a9a";
  if (rank <= 3) return "#1f8a4c";
  if (rank <= 10) return "#b7791f";
  return "#c53030";
}

function icon(rank: number | null, depth: number) {
  const label = rank === null ? `${depth}+` : String(rank);
  return L.divIcon({
    className: "",
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    html: `<div style="width:34px;height:34px;border-radius:50%;background:${rankColor(rank)};color:#fff;display:grid;place-items:center;font:600 13px Oswald,sans-serif;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35)">${label}</div>`,
  });
}

export default function GridMap({ points, center, depth, business }: { points: GridPoint[]; center: [number, number]; depth: number; business: [number, number] }) {
  return (
    <MapContainer center={center} zoom={12} scrollWheelZoom={false} style={{ height: 460, width: "100%", borderRadius: 6 }}>
      <TileLayer
        attribution="Tiles &copy; Esri &mdash; Esri, HERE, Garmin, &copy; OpenStreetMap contributors"
        url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}"
        maxZoom={18}
      />
      <Marker
        zIndexOffset={1000}
        position={business}
        icon={L.divIcon({ className: "", iconSize: [18, 18], iconAnchor: [9, 9], html: '<div style="width:18px;height:18px;background:#ff781a;border:3px solid #111;transform:rotate(45deg)"></div>' })}
      >
        <Tooltip>Your business</Tooltip>
      </Marker>
      {points.map((p, i) => (
        <Marker key={i} position={[p.lat, p.lng]} icon={icon(p.rank, depth)}>
          <Tooltip>
            <b>{p.rank === null ? `Not in top ${depth}` : `Rank #${p.rank}`}</b>
            {p.top.length > 0 && (
              <ol style={{ margin: "4px 0 0", paddingLeft: 16 }}>
                {p.top.map((t) => <li key={t}>{t}</li>)}
              </ol>
            )}
          </Tooltip>
        </Marker>
      ))}
    </MapContainer>
  );
}
