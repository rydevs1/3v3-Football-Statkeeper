"use client";

import { useEffect, useState } from "react";
import { listGames, StoredGame } from "@/lib/storage";

export default function HomePage() {
  const [games, setGames] = useState<StoredGame[]>([]);

  useEffect(() => {
    setGames(listGames());
  }, []);

  return (
    <main style={{ padding: 16, maxWidth: 900, margin: "0 auto" }}>
      <h1 style={{ fontSize: 28, fontWeight: 950, marginTop: 0 }}>
        3v3 Football Statkeeper
      </h1>

      <a
        href="/exhibition/setup"
        style={{
          display: "inline-block",
          padding: "12px 14px",
          borderRadius: 14,
          border: "1px solid #ddd",
          fontWeight: 900,
          textDecoration: "none",
        }}
      >
        + New Exhibition Game
      </a>

      <h2 style={{ marginTop: 18, fontSize: 18, fontWeight: 950 }}>
        Recent Games
      </h2>

      {games.length === 0 ? (
        <div style={{ opacity: 0.7 }}>No games yet.</div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {games.map((g) => (
            <a
              key={g.id}
              href={`/game/${g.id}`}
              style={{
                display: "block",
                padding: 12,
                border: "1px solid #eee",
                borderRadius: 14,
                textDecoration: "none",
                color: "inherit",
              }}
            >
              <div style={{ fontWeight: 950 }}>
                {g.team1Name} {g.finalScoreA ?? 0} — {g.finalScoreB ?? 0}{" "}
                {g.team2Name}
              </div>
              <div style={{ opacity: 0.7, marginTop: 4 }}>
                {g.endedAt ? "FINAL" : "In progress"} •{" "}
                {new Date(g.createdAt).toLocaleString()}
              </div>
            </a>
          ))}
        </div>
      )}
    </main>
  );
}