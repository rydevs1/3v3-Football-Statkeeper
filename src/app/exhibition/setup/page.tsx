"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createGame, Side } from "@/lib/storage";

function makePlayers(prefix: "t1" | "t2", names: string[]) {
  return names.map((name, i) => ({
    id: `${prefix}p${i + 1}`,
    name: name.trim(),
  }));
}

export default function ExhibitionSetupPage() {
  const router = useRouter();

  const [team1Name, setTeam1Name] = useState("Team 1");
  const [team2Name, setTeam2Name] = useState("Team 2");

  const [t1p1, setT1p1] = useState("P1");
  const [t1p2, setT1p2] = useState("P2");
  const [t1p3, setT1p3] = useState("P3");

  const [t2p1, setT2p1] = useState("P4");
  const [t2p2, setT2p2] = useState("P5");
  const [t2p3, setT2p3] = useState("P6");

  const [startOffense, setStartOffense] = useState<Side>("A");
  const [startDirection, setStartDirection] = useState<1 | -1>(-1);

  const [error, setError] = useState<string | null>(null);

  function handleCreate() {
    setError(null);

    const t1Players = [t1p1, t1p2, t1p3].map((s) => s.trim()).filter(Boolean);
    const t2Players = [t2p1, t2p2, t2p3].map((s) => s.trim()).filter(Boolean);

    if (!team1Name.trim() || !team2Name.trim()) {
      setError("Enter both team names.");
      return;
    }
    if (t1Players.length !== 3 || t2Players.length !== 3) {
      setError("Each team needs exactly 3 player names.");
      return;
    }

    const game = createGame({
      team1Name: team1Name.trim(),
      team2Name: team2Name.trim(),
      team1Players: makePlayers("t1", t1Players),
      team2Players: makePlayers("t2", t2Players),
      exhStartOffenseSide: startOffense,
      exhStartDirection: startDirection,
    });

    router.push(`/game/${game.id}`);
  }

  const btn: React.CSSProperties = {
    padding: 12,
    borderRadius: 12,
    border: "1px solid #ddd",
    fontWeight: 900,
    width: "100%",
    cursor: "pointer",
  };

  function toggleStyle(active: boolean): React.CSSProperties {
    return { ...btn, background: active ? "#111" : "#fff", color: active ? "#fff" : "#111" };
  }

  return (
    <main style={{ padding: 16, maxWidth: 900, margin: "0 auto" }}>
      <h1 style={{ fontSize: 24, fontWeight: 950, marginTop: 0 }}>
        Exhibition Setup
      </h1>

      {error && (
        <div style={{ color: "crimson", fontWeight: 800, marginBottom: 12 }}>
          {error}
        </div>
      )}

      <section style={{ border: "1px solid #eee", borderRadius: 14, padding: 12, marginBottom: 12 }}>
        <div style={{ fontWeight: 950 }}>Pregame Settings</div>

        <div style={{ marginTop: 10, fontWeight: 900, opacity: 0.8 }}>
          Starting possession
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 8 }}>
          <button style={toggleStyle(startOffense === "A")} onClick={() => setStartOffense("A")}>
            {team1Name || "Team 1"} starts
          </button>
          <button style={toggleStyle(startOffense === "B")} onClick={() => setStartOffense("B")}>
            {team2Name || "Team 2"} starts
          </button>
        </div>

        <div style={{ marginTop: 12, fontWeight: 900, opacity: 0.8 }}>
          Starting attack direction
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 8 }}>
          <button style={toggleStyle(startDirection === -1)} onClick={() => setStartDirection(-1)}>
            Attack → 0
          </button>
          <button style={toggleStyle(startDirection === 1)} onClick={() => setStartDirection(1)}>
            Attack → 50
          </button>
        </div>
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <section style={{ border: "1px solid #eee", borderRadius: 14, padding: 12 }}>
          <div style={{ fontWeight: 950 }}>Team 1</div>
          <input value={team1Name} onChange={(e) => setTeam1Name(e.target.value)} placeholder="Team 1 name"
            style={{ marginTop: 8, width: "100%", padding: 12, borderRadius: 12, border: "1px solid #ddd", boxSizing: "border-box" }} />
          <div style={{ marginTop: 10, opacity: 0.8, fontWeight: 800 }}>Players (3)</div>
          {[
            [t1p1, setT1p1],
            [t1p2, setT1p2],
            [t1p3, setT1p3],
          ].map(([val, setter], i) => (
            <input key={i} value={val as string}
              onChange={(e) => (setter as (v: string) => void)(e.target.value)}
              placeholder={`Player ${i + 1}`}
              style={{ marginTop: 8, width: "100%", padding: 12, borderRadius: 12, border: "1px solid #ddd", boxSizing: "border-box" }} />
          ))}
        </section>

        <section style={{ border: "1px solid #eee", borderRadius: 14, padding: 12 }}>
          <div style={{ fontWeight: 950 }}>Team 2</div>
          <input value={team2Name} onChange={(e) => setTeam2Name(e.target.value)} placeholder="Team 2 name"
            style={{ marginTop: 8, width: "100%", padding: 12, borderRadius: 12, border: "1px solid #ddd", boxSizing: "border-box" }} />
          <div style={{ marginTop: 10, opacity: 0.8, fontWeight: 800 }}>Players (3)</div>
          {[
            [t2p1, setT2p1],
            [t2p2, setT2p2],
            [t2p3, setT2p3],
          ].map(([val, setter], i) => (
            <input key={i} value={val as string}
              onChange={(e) => (setter as (v: string) => void)(e.target.value)}
              placeholder={`Player ${i + 1}`}
              style={{ marginTop: 8, width: "100%", padding: 12, borderRadius: 12, border: "1px solid #ddd", boxSizing: "border-box" }} />
          ))}
        </section>
      </div>

      <button onClick={handleCreate}
        style={{ marginTop: 14, width: "100%", padding: 14, borderRadius: 14, border: "1px solid #ddd", fontWeight: 950, cursor: "pointer" }}>
        Create Exhibition Game
      </button>
    </main>
  );
}