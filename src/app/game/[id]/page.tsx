"use client";

import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { getGame, updateGame, type StoredGame } from "@/lib/storage";

type TeamRow = { id: string; name: string };
type PlayerRow = { id: string; name: string };

type Side = "A" | "B"; // A = team1, B = team2

type GameRow = {
  id: string;
  team1_id: string;
  team2_id: string;
  team1_score: number;
  team2_score: number;
  is_exhibition: boolean;
  ended_at: string | null;
  team1_name: string | null;
  team2_name: string | null;
  team1_players: { id: string; name: string }[] | null;
  team2_players: { id: string; name: string }[] | null;
  
  exh_start_offense_side?: Side | null;
  exh_start_direction?: 1 | -1 | null;
};

type DraftEvent = {
  game_id: string;
  log: string;
  start_ydline: number;
  end_ydline: number;
  yds: number;

  passer: string | null;
  target: string | null;
  deflector: string | null;
  interceptor: string | null;
  sacker: string | null;

  is_turnover: boolean;
};

type PlayerStats = {
  passAttempts: number;
  passCompletions: number;
  receptions: number;
  touchdowns: number;
  conversions1: number;
  conversions2: number;
  interceptions: number;
  deflections: number;
  sacks: number;
  punts: number;
};

type Phase =
  | "S0_SNAP"
  | "S1_PREPASS"
  | "S2_POSTPASS"
  | "S3_DEF_CARRIER"
  | "S4_TARGET_Q"
  | "S5_COMPLETE_Q"
  | "S6_DEFLECT_Q"
  | "S7_INTERCEPT_Q"
  | "S8_SACK_Q"
  | "S9_DOWN_END"
  | "S10_PUNT"
  | "S11_PREPASS_LATERAL"
  | "S12_POSTPASS_LATERAL"
  | "S13_DEF_LATERAL"
  | "S14_FUMBLE"
  | "S15_DEF_FUMBLE"
  | "S16_CONV_CHOOSE_TRY"
  | "S17_CONV_CHOOSE_SCORER"
  | "S18_SAFETY_KICK_KICKER"
  | "S19_SAFETY_KICK_RETURNER";

type GameFlowState = {
  phase: Phase;

  ballSpot: number;

  offenseSide: Side;
  direction: 1 | -1; // direction of current offenseSide

  down: 1 | 2 | 3 | 4;
  lineToGain: number;
  toGo: number;

  ballSide: Side;

  scoreA: number;
  scoreB: number;

  convTry: 1 | 2 | null;

  carrier: string | null;

  draft: DraftEvent;
  playLog: string[];
  playerStats: Record<string, PlayerStats>;
  ended: boolean;

  history: GameFlowState[];
};

type Action =
  | { type: "UNDO" }
  | { type: "RESET_TO_S0" }
  | { type: "CONFIRM_END_YDLINE_TO_LOG" }
  | { type: "SET_END_YDLINE"; endYdline: number }

  | { type: "SET_SNAP_CARRIER"; playerId: string; side: Side }

  | { type: "GO_PREPASS_LATERAL" }
  | { type: "GO_TARGET_Q" }
  | { type: "GO_SACK_Q" }
  | { type: "GO_PUNT" }
  | { type: "GO_FUMBLE" }

  | { type: "GO_POSTPASS_LATERAL" }
  | { type: "GO_DOWN_END" }
  | { type: "GO_FUMBLE_FROM_POSTPASS" }

  | { type: "GO_DEF_LATERAL" }
  | { type: "GO_DEF_FUMBLE" }
  | { type: "GO_DOWN_END_FROM_DEF" }

  | { type: "SET_PASS_TARGET"; playerId: string }
  | { type: "TARGET_NONE" }

  | { type: "PASS_COMPLETE" }
  | { type: "PASS_INCOMPLETE" }

  | { type: "SET_DEFLECTOR"; playerId: string }
  | { type: "DEFLECT_NONE" }

  | { type: "SET_INTERCEPTOR"; playerId: string; side: Side }
  | { type: "INTERCEPT_NONE" }

  | { type: "SET_SACKER"; playerId: string }
  | { type: "SACK_NONE" }

  | { type: "PUNT_DOWN" }
  | { type: "PUNT_PICK_DEF_CARRIER"; playerId: string; side: Side }

  | { type: "SET_PREPASS_LATERAL_TARGET"; playerId: string; side: Side }
  | { type: "SET_POSTPASS_LATERAL_TARGET"; playerId: string; side: Side }
  | { type: "SET_DEF_LATERAL_TARGET"; playerId: string; side: Side }

  | { type: "SET_FUMBLE_RECOVER_DEF"; playerId: string; side: Side }
  | { type: "SET_FUMBLE_RECOVER_OFF"; playerId: string; side: Side }

  | { type: "CONV_CHOOSE_TRY"; pts: 1 | 2 }
  | { type: "CONV_SCORE_PLAYER"; playerId: string; side: Side }
  | { type: "CONV_FAILED" }

  | { type: "SAFETY_KICK_SET_KICKER"; playerId: string; side: Side }
  | { type: "SAFETY_KICK_SET_RETURNER"; playerId: string; side: Side }
  | { type: "SAFETY_KICK_DOWN" }

  | { type: "EXH_SET_START_OFFENSE"; side: Side }
  | { type: "EXH_SET_START_DIRECTION"; direction: 1 | -1 }

  | { type: "HALFTIME_SWITCH_SIDES" }
  | { type: "END_GAME" };

function cloneWithoutHistory(s: GameFlowState): GameFlowState {
  const { history, ...rest } = s;
  return { ...rest, history: [] };
}
function pushHistory(s: GameFlowState): GameFlowState {
  return { ...s, history: [...s.history, cloneWithoutHistory(s)] };
}

function appendLog(draftLog: string, segment: string) {
  if (!draftLog) return segment;
  const trimmed = draftLog.trimEnd();
  if (trimmed.endsWith(":")) return `${trimmed} ${segment}`;
  return `${trimmed}, ${segment}`;
}

function otherSide(side: Side): Side {
  return side === "A" ? "B" : "A";
}

function addScore(s: GameFlowState, side: Side, pts: number): GameFlowState {
  return side === "A" ? { ...s, scoreA: s.scoreA + pts } : { ...s, scoreB: s.scoreB + pts };
}

function scoreBracket(s: GameFlowState, scoringSide: Side) {
  const a = s.scoreA, b = s.scoreB;
  if (scoringSide === "A") return `[A ${a} - ${b} B]`;
  return `[B ${b} - ${a} A]`;
}

function attackDirectionForBall(s: GameFlowState): 1 | -1 {
  return s.ballSide === s.offenseSide ? s.direction : ((s.direction * -1) as 1 | -1);
}
function attackEndline(s: GameFlowState) {
  return attackDirectionForBall(s) === -1 ? 0 : 50;
}
function defendEndline(s: GameFlowState) {
  return attackDirectionForBall(s) === -1 ? 50 : 0;
}
function reachedOrPast(spot: number, endline: number, dir: 1 | -1) {
  return (spot - endline) * dir > 0;
}

function enterDownEnd(s: GameFlowState, extraLog?: string): GameFlowState {
  const start = s.draft.start_ydline ?? s.ballSpot ?? 50;
  const end = s.ballSpot ?? start;
  const nextLog = extraLog ? appendLog(s.draft.log, extraLog) : s.draft.log;

  return {
    ...s,
    phase: "S9_DOWN_END",
    draft: {
      ...s.draft,
      log: nextLog,
      end_ydline: end,
      yds: Math.abs(end - start),
    },
  };
}
//helpers
function ordinalDown(d: number) {
  return d === 1 ? "1st" : d === 2 ? "2nd" : d === 3 ? "3rd" : "4th";
}
function makeDnD(down: 1 | 2 | 3 | 4, toGo: number) {
  return `${ordinalDown(down)} & ${Math.max(0, Math.round(toGo))}:`;
}
function computeLineToGain(spot: number, direction: 1 | -1) {
  if (direction === -1) return spot > 25 ? 25 : 0;
  return spot < 25 ? 25 : 50;
}
function computeToGo(spot: number, lineToGain: number, direction: 1 | -1) {
  return Math.max(0, (lineToGain - spot) * direction);
}
function reachedLineToGain(spot: number, lineToGain: number, direction: 1 | -1) {
  return (spot - lineToGain) * direction >= 0;
}
function startSpotForDirection(direction: 1 | -1) {
  return direction === 1 ? 0 : 50;
}


function emptyPlayerStats(): PlayerStats {
  return {
    passAttempts: 0,
    passCompletions: 0,
    receptions: 0,
    touchdowns: 0,
    conversions1: 0,
    conversions2: 0,
    interceptions: 0,
    deflections: 0,
    sacks: 0,
    punts: 0,
  };
}

function addPlayerStat(
  stats: Record<string, PlayerStats>,
  playerId: string | null,
  key: keyof PlayerStats,
  amount = 1
) {
  if (!playerId) return stats;
  const current = stats[playerId] ?? emptyPlayerStats();
  return {
    ...stats,
    [playerId]: {
      ...current,
      [key]: current[key] + amount,
    },
  };
}

function applyDraftStats(
  stats: Record<string, PlayerStats>,
  draft: DraftEvent
): Record<string, PlayerStats> {
  let next = stats;
  const log = draft.log;

  const attemptedPass = log.includes("Target ") || log.includes("Target none");
  const completedPass = log.includes("Complete");
  const punted = log.includes("Punt");

  if (attemptedPass) next = addPlayerStat(next, draft.passer, "passAttempts");
  if (completedPass) next = addPlayerStat(next, draft.passer, "passCompletions");
  if (completedPass) next = addPlayerStat(next, draft.target, "receptions");
  if (draft.interceptor) next = addPlayerStat(next, draft.interceptor, "interceptions");
  if (draft.deflector) next = addPlayerStat(next, draft.deflector, "deflections");
  if (draft.sacker) next = addPlayerStat(next, draft.sacker, "sacks");
  if (punted) next = addPlayerStat(next, draft.passer, "punts");

  return next;
}

function initialFlowState(gameId: string): GameFlowState {
  const startSpot = 50;
  const offenseSide: Side = "A";
  const direction: 1 | -1 = -1;

  const lineToGain = computeLineToGain(startSpot, direction);
  const toGo = computeToGo(startSpot, lineToGain, direction);

  return {
    phase: "S0_SNAP",
    offenseSide,
    direction,
    ballSpot: startSpot,
    down: 1,
    lineToGain,
    toGo,
    ballSide: offenseSide,
    scoreA: 0,
    scoreB: 0,
    convTry: null,
    carrier: null,
    draft: {
      game_id: gameId,
      log: makeDnD(1, toGo),
      start_ydline: startSpot,
      end_ydline: startSpot,
      yds: 0,
      passer: null,
      target: null,
      deflector: null,
      interceptor: null,
      sacker: null,
      is_turnover: false,
    },
    playLog: [],
    playerStats: {},
    ended: false,
    history: [],
  };
}

function reducer(state: GameFlowState, action: Action): GameFlowState {
  if (action.type === "UNDO") {
    if (state.history.length === 0) return state;
    const prev = state.history[state.history.length - 1];
    return { ...prev, history: state.history.slice(0, -1) };
  }

  const s = pushHistory(state);

  switch (action.type) {
    case "EXH_SET_START_OFFENSE": {
  const startSpot = startSpotForDirection(s.direction); 
  const lineToGain = computeLineToGain(startSpot, s.direction);
  const toGo = computeToGo(startSpot, lineToGain, s.direction);

  return {
    ...s,
    offenseSide: action.side,
    ballSide: action.side,
    ballSpot: startSpot,
    down: 1,
    lineToGain,
    toGo,
    carrier: null,
    phase: "S0_SNAP",
    draft: {
      ...s.draft,
      log: makeDnD(1, toGo),
      start_ydline: startSpot,
      end_ydline: startSpot,
      yds: 0,
      passer: null,
      target: null,
      deflector: null,
      interceptor: null,
      sacker: null,
      is_turnover: false,
    },
  };
}


    case "EXH_SET_START_DIRECTION": {
  const startSpot = startSpotForDirection(action.direction);
  const lineToGain = computeLineToGain(startSpot, action.direction);
  const toGo = computeToGo(startSpot, lineToGain, action.direction);

  return {
    ...s,
    direction: action.direction,
    ballSpot: startSpot,
    down: 1,
    lineToGain,
    toGo,
    carrier: null,
    phase: "S0_SNAP",
    draft: {
      ...s.draft,
      log: makeDnD(1, toGo),
      start_ydline: startSpot,
      end_ydline: startSpot,
      yds: 0,
      passer: null,
      target: null,
      deflector: null,
      interceptor: null,
      sacker: null,
      is_turnover: false,
    },
  };
}


    case "END_GAME": {
      return {
        ...s,
        ended: true,
        playLog: [...s.playLog, `FINAL: ${s.scoreA}-${s.scoreB}`],
      };
    }

    case "HALFTIME_SWITCH_SIDES": {
      const newSpot = 50 - (s.ballSpot ?? 50);
      const newDirection = ((s.direction * -1) as 1 | -1);

      const newLineToGain = computeLineToGain(newSpot, newDirection);
      const newToGo = computeToGo(newSpot, newLineToGain, newDirection);

      return {
        ...s,
        direction: newDirection,
        ballSpot: newSpot,
        lineToGain: newLineToGain,
        toGo: newToGo,
        playLog: [...s.playLog, "HALFTIME"],
        carrier: null,
        phase: "S0_SNAP",
        draft: {
          ...s.draft,
          log: makeDnD(s.down, newToGo),
          start_ydline: newSpot,
          end_ydline: newSpot,
          yds: 0,
          passer: null,
          target: null,
          deflector: null,
          interceptor: null,
          sacker: null,
          is_turnover: false,
        },
      };
    }

    case "SET_END_YDLINE": {
      // allow -1 .. 51 typing
      const end = Math.max(-1, Math.min(51, action.endYdline));
      const start = s.draft.start_ydline ?? s.ballSpot ?? 50;
      const yds = Math.abs(end - start);
      return { ...s, draft: { ...s.draft, end_ydline: end, yds } };
    }

    case "CONFIRM_END_YDLINE_TO_LOG": {
      const line = `${s.draft.log} (end ${s.draft.end_ydline})`;
      return {
        ...s,
        playLog: [...s.playLog, line],
        playerStats: applyDraftStats(s.playerStats, s.draft),
      };
    }

    case "RESET_TO_S0": {
      const end = s.draft.end_ydline ?? s.ballSpot ?? 50;
      let ns: GameFlowState = { ...s, ballSpot: end };

      const dirForBall = attackDirectionForBall(ns);
      const attEnd = attackEndline(ns);
      const defEnd = defendEndline(ns);

      const isTD = reachedOrPast(end, attEnd, dirForBall);
      const isSafety = reachedOrPast(end, defEnd, ((dirForBall * -1) as 1 | -1));

      if (isSafety) {
        const scoringSide = otherSide(ns.ballSide);
        ns = addScore(ns, scoringSide, 1);

        if (ns.playLog.length > 0) {
          const last = ns.playLog[ns.playLog.length - 1];
          ns = { ...ns, playLog: [...ns.playLog.slice(0, -1), `${last}, SAFETY ${scoreBracket(ns, scoringSide)}`] };
        }

        const kickingSide = ns.ballSide;
        const kickSpot = defEnd;

        return {
          ...ns,
          phase: "S18_SAFETY_KICK_KICKER",
          offenseSide: kickingSide,
          ballSide: kickingSide,
          ballSpot: kickSpot,
          down: 1,
          lineToGain: computeLineToGain(kickSpot, ns.direction),
          toGo: computeToGo(kickSpot, computeLineToGain(kickSpot, ns.direction), ns.direction),
          convTry: null,
          carrier: null,
          draft: {
            ...ns.draft,
            log: "SAFETY KICK:",
            start_ydline: kickSpot,
            end_ydline: kickSpot,
            yds: 0,
            passer: null,
            target: null,
            deflector: null,
            interceptor: null,
            sacker: null,
            is_turnover: false,
          },
        };
      }

      if (isTD) {
        const scoringSide = ns.ballSide;
        ns = addScore(ns, scoringSide, 3);

        if (ns.playLog.length > 0) {
          const last = ns.playLog[ns.playLog.length - 1];
          ns = { ...ns, playLog: [...ns.playLog.slice(0, -1), `${last}, TOUCHDOWN ${scoreBracket(ns, scoringSide)}`] };
        }
        ns = { ...ns, playerStats: addPlayerStat(ns.playerStats, ns.carrier, "touchdowns") };

        return {
          ...ns,
          phase: "S16_CONV_CHOOSE_TRY",
          convTry: null,
          carrier: null,
          draft: {
            ...ns.draft,
            log: "CONVERSION:",
            start_ydline: end,
            end_ydline: end,
            yds: 0,
            passer: null,
            target: null,
            deflector: null,
            interceptor: null,
            sacker: null,
            is_turnover: false,
          },
        };
      }

      const madeFirst = reachedLineToGain(end, ns.lineToGain, ns.direction);
      const nextDownCandidate = madeFirst ? 1 : (ns.down + 1);
      const turnoverOnDowns = !madeFirst && nextDownCandidate > 4;
      const turnover = Boolean(ns.draft.is_turnover) || turnoverOnDowns;

      const nextOffenseSide: Side = turnover ? otherSide(ns.offenseSide) : ns.offenseSide;
      const nextDirection: 1 | -1 = turnover ? ((ns.direction * -1) as 1 | -1) : ns.direction;

      const nextDown: 1 | 2 | 3 | 4 = turnover ? 1 : (madeFirst ? 1 : (nextDownCandidate as 1 | 2 | 3 | 4));
      const nextLineToGain = computeLineToGain(end, nextDirection);
      const nextToGo = computeToGo(end, nextLineToGain, nextDirection);

      return {
        ...ns,
        phase: "S0_SNAP",
        offenseSide: nextOffenseSide,
        direction: nextDirection,
        down: nextDown,
        lineToGain: nextLineToGain,
        toGo: nextToGo,
        ballSide: nextOffenseSide,
        convTry: null,
        carrier: null,
        draft: {
          ...ns.draft,
          log: makeDnD(nextDown, nextToGo),
          start_ydline: end,
          end_ydline: end,
          yds: 0,
          passer: null,
          target: null,
          deflector: null,
          interceptor: null,
          sacker: null,
          is_turnover: false,
        },
      };
    }

    // --- conversion flow ---
    case "CONV_CHOOSE_TRY":
      return { ...s, phase: "S17_CONV_CHOOSE_SCORER", convTry: action.pts, draft: { ...s.draft, log: appendLog(s.draft.log, `${action.pts}pt try`) } };

    case "CONV_SCORE_PLAYER": {
      const pts = s.convTry ?? 1;
      let ns = addScore(s, action.side, pts);

      const line = `${s.draft.log} SCORED ${action.playerId} ${scoreBracket(ns, action.side)}`;
      ns = {
        ...ns,
        playLog: [...ns.playLog, line],
        playerStats: addPlayerStat(
          s.playerStats,
          action.playerId,
          pts === 1 ? "conversions1" : "conversions2"
        ),
      };

      const dirForBall = attackDirectionForBall(s);
      const nextOff = otherSide(s.ballSide);
      const nextDir: 1 | -1 = ((dirForBall * -1) as 1 | -1);
      const nextSpot = nextDir === -1 ? 50 : 0;

      const nextLTG = computeLineToGain(nextSpot, nextDir);
      const nextToGo = computeToGo(nextSpot, nextLTG, nextDir);

      return {
        ...ns,
        phase: "S0_SNAP",
        offenseSide: nextOff,
        direction: nextDir,
        ballSide: nextOff,
        ballSpot: nextSpot,
        down: 1,
        lineToGain: nextLTG,
        toGo: nextToGo,
        convTry: null,
        carrier: null,
        draft: {
          ...ns.draft,
          log: makeDnD(1, nextToGo),
          start_ydline: nextSpot,
          end_ydline: nextSpot,
          yds: 0,
          passer: null,
          target: null,
          deflector: null,
          interceptor: null,
          sacker: null,
          is_turnover: false,
        },
      };
    }

    case "CONV_FAILED": {
      const line = `${s.draft.log} FAILED`;
      const dirForBall = attackDirectionForBall(s);
      const nextOff = otherSide(s.ballSide);
      const nextDir: 1 | -1 = ((dirForBall * -1) as 1 | -1);
      const nextSpot = nextDir === -1 ? 50 : 0;

      const nextLTG = computeLineToGain(nextSpot, nextDir);
      const nextToGo = computeToGo(nextSpot, nextLTG, nextDir);

      return {
        ...s,
        playLog: [...s.playLog, line],
        phase: "S0_SNAP",
        offenseSide: nextOff,
        direction: nextDir,
        ballSide: nextOff,
        ballSpot: nextSpot,
        down: 1,
        lineToGain: nextLTG,
        toGo: nextToGo,
        convTry: null,
        carrier: null,
        draft: {
          ...s.draft,
          log: makeDnD(1, nextToGo),
          start_ydline: nextSpot,
          end_ydline: nextSpot,
          yds: 0,
          passer: null,
          target: null,
          deflector: null,
          interceptor: null,
          sacker: null,
          is_turnover: false,
        },
      };
    }

    // --- safety kick flow ---
    case "SAFETY_KICK_SET_KICKER":
      return { ...s, phase: "S19_SAFETY_KICK_RETURNER", carrier: action.playerId, ballSide: action.side, draft: { ...s.draft, log: appendLog(s.draft.log, `Kicker ${action.playerId}`) } };

    case "SAFETY_KICK_SET_RETURNER": {
      const kickingSide = s.ballSide;
      const receivingSide = otherSide(kickingSide);

      const nextOff = receivingSide;
      const nextDir: 1 | -1 = ((s.direction * -1) as 1 | -1);

      const ns: GameFlowState = {
        ...s,
        offenseSide: nextOff,
        direction: nextDir,
        ballSide: nextOff,
        carrier: action.playerId,
        draft: { ...s.draft, log: appendLog(s.draft.log, `Returner ${action.playerId}`), is_turnover: false },
      };

      return enterDownEnd(ns, "Safety kick return");
    }

    case "SAFETY_KICK_DOWN":
      return enterDownEnd(s, "Safety kick downed");

    // --- base flow ---
    case "SET_SNAP_CARRIER":
      return { ...s, phase: "S1_PREPASS", carrier: action.playerId, ballSide: action.side, draft: { ...s.draft, passer: action.playerId, log: appendLog(s.draft.log, `Carrier ${action.playerId}`) } };

    case "GO_PREPASS_LATERAL":
      return { ...s, phase: "S11_PREPASS_LATERAL" };
    case "GO_TARGET_Q":
      return { ...s, phase: "S4_TARGET_Q" };
    case "GO_SACK_Q":
      return { ...s, phase: "S8_SACK_Q" };
    case "GO_PUNT":
      return { ...s, phase: "S10_PUNT", draft: { ...s.draft, log: appendLog(s.draft.log, "Punt") } };
    case "GO_FUMBLE":
      return { ...s, phase: "S14_FUMBLE", draft: { ...s.draft, log: appendLog(s.draft.log, "Fumble") } };

    case "GO_POSTPASS_LATERAL":
      return { ...s, phase: "S12_POSTPASS_LATERAL" };
    case "GO_DOWN_END":
      return enterDownEnd(s, "Down");
    case "GO_FUMBLE_FROM_POSTPASS":
      return { ...s, phase: "S14_FUMBLE", draft: { ...s.draft, log: appendLog(s.draft.log, "Fumble") } };

    case "GO_DEF_LATERAL":
      return { ...s, phase: "S13_DEF_LATERAL" };
    case "GO_DEF_FUMBLE":
      return { ...s, phase: "S15_DEF_FUMBLE", draft: { ...s.draft, log: appendLog(s.draft.log, "Defense fumble") } };
    case "GO_DOWN_END_FROM_DEF":
      return enterDownEnd(s, "Down");

    case "SET_PASS_TARGET":
      return { ...s, phase: "S5_COMPLETE_Q", draft: { ...s.draft, target: action.playerId, log: appendLog(s.draft.log, `Target ${action.playerId}`) } };
    case "TARGET_NONE":
      return { ...s, phase: "S6_DEFLECT_Q", draft: { ...s.draft, target: null, log: appendLog(s.draft.log, "Target none") } };

    case "PASS_COMPLETE": {
      const newCarrier = s.draft.target ?? s.carrier;
      return { ...s, phase: "S2_POSTPASS", carrier: newCarrier, draft: { ...s.draft, log: appendLog(s.draft.log, "Complete") } };
    }
    case "PASS_INCOMPLETE":
      return { ...s, phase: "S6_DEFLECT_Q", draft: { ...s.draft, log: appendLog(s.draft.log, "Incomplete") } };

    case "SET_DEFLECTOR":
      return { ...s, phase: "S7_INTERCEPT_Q", draft: { ...s.draft, deflector: action.playerId, log: appendLog(s.draft.log, `Deflect ${action.playerId}`) } };
    case "DEFLECT_NONE":
      return { ...s, phase: "S7_INTERCEPT_Q", draft: { ...s.draft, deflector: null, log: appendLog(s.draft.log, "Deflect none") } };

    case "SET_INTERCEPTOR":
      return { ...s, phase: "S3_DEF_CARRIER", carrier: action.playerId, ballSide: action.side, draft: { ...s.draft, interceptor: action.playerId, is_turnover: true, log: appendLog(s.draft.log, `INT ${action.playerId}`) } };
    case "INTERCEPT_NONE":
      return enterDownEnd(s, "No INT");

    case "SET_SACKER":
      return enterDownEnd({ ...s, draft: { ...s.draft, sacker: action.playerId, log: appendLog(s.draft.log, `Sack ${action.playerId}`) } });
    case "SACK_NONE":
      return enterDownEnd({ ...s, draft: { ...s.draft, sacker: null, log: appendLog(s.draft.log, "No sack") } });

    case "PUNT_PICK_DEF_CARRIER":
      return { ...s, phase: "S3_DEF_CARRIER", carrier: action.playerId, ballSide: action.side, draft: { ...s.draft, is_turnover: true, log: appendLog(s.draft.log, `Punt return ${action.playerId}`) } };
    case "PUNT_DOWN": {
  const receivingSide = otherSide(s.offenseSide); // defense gets the ball on a downed punt
  return enterDownEnd(
    {
      ...s,
      ballSide: receivingSide,
      draft: { ...s.draft, is_turnover: true },
    },
    "Punt downed"
  );
}

    case "SET_PREPASS_LATERAL_TARGET":
      return { ...s, phase: "S1_PREPASS", carrier: action.playerId, ballSide: action.side, draft: { ...s.draft, log: appendLog(s.draft.log, `Lateral ${action.playerId}`) } };
    case "SET_POSTPASS_LATERAL_TARGET":
      return { ...s, phase: "S2_POSTPASS", carrier: action.playerId, ballSide: action.side, draft: { ...s.draft, log: appendLog(s.draft.log, `Lateral ${action.playerId}`) } };
    case "SET_DEF_LATERAL_TARGET":
      return { ...s, phase: "S3_DEF_CARRIER", carrier: action.playerId, ballSide: action.side, draft: { ...s.draft, log: appendLog(s.draft.log, `Def lateral ${action.playerId}`) } };

    case "SET_FUMBLE_RECOVER_DEF":
      return { ...s, phase: "S3_DEF_CARRIER", carrier: action.playerId, ballSide: action.side, draft: { ...s.draft, is_turnover: true, log: appendLog(s.draft.log, `Recovered DEF ${action.playerId}`) } };
    case "SET_FUMBLE_RECOVER_OFF":
      return { ...s, phase: "S2_POSTPASS", carrier: action.playerId, ballSide: action.side, draft: { ...s.draft, is_turnover: false, log: appendLog(s.draft.log, `Recovered OFF ${action.playerId}`) } };

    default:
      return s;
  }
}

export default function GamePage({ params }: { params: { id: string } }) {
  const gameId = params.id;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [game, setGame] = useState<GameRow | null>(null);
  const [team1, setTeam1] = useState<TeamRow | null>(null);
  const [team2, setTeam2] = useState<TeamRow | null>(null);

  const [players1, setPlayers1] = useState<PlayerRow[]>([]);
  const [players2, setPlayers2] = useState<PlayerRow[]>([]);

  const [state, dispatch] = useReducer(reducer, initialFlowState(gameId));

  //ensure we only apply exhibition starting settings once
  const appliedExhStartRef = useRef(false);

  const playerNameById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const p of players1) map[p.id] = p.name;
    for (const p of players2) map[p.id] = p.name;
    return map;
  }, [players1, players2]);

  const statsByPlayer = state.playerStats;

  function prettyLog(raw: string) {
    let s = raw;

    for (const [id, name] of Object.entries(playerNameById)) {
      s = s.replaceAll(id, name);
    }

    if (team1 && team2) {
      s = s.replaceAll("[A ", `[${team1.name} `);
      s = s.replaceAll(" B]", ` ${team2.name}]`);
      s = s.replaceAll("[B ", `[${team2.name} `);
      s = s.replaceAll(" A]", ` ${team1.name}]`);
    }

    return s;
  }

  function loadAll() {
    setLoading(true);
    setError(null);

    const g = getGame(gameId);
    if (!g) {
      setError("Game not found.");
      setLoading(false);
      return;
    }

    setGame(g as any);
    setTeam1({ id: "EXH_T1", name: g.team1Name });
    setTeam2({ id: "EXH_T2", name: g.team2Name });
    setPlayers1(g.team1Players);
    setPlayers2(g.team2Players);
    setLoading(false);
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId]);

  useEffect(() => {
    if (!game) return;
    if (appliedExhStartRef.current) return;

    const g = game as any as StoredGame;
    dispatch({ type: "EXH_SET_START_DIRECTION", direction: (g.exhStartDirection ?? -1) as 1 | -1 });
    dispatch({ type: "EXH_SET_START_OFFENSE", side: (g.exhStartOffenseSide ?? "A") as Side });

    appliedExhStartRef.current = true;
  }, [game]);


  useEffect(() => {
    if (!state.ended) return;

    updateGame(gameId, {
      endedAt: new Date().toISOString(),
      finalScoreA: state.scoreA,
      finalScoreB: state.scoreB,
      playLog: state.playLog,
      playerStats: state.playerStats,
    } as any);
  }, [gameId, state.ended, state.playLog, state.playerStats, state.scoreA, state.scoreB]);

  if (loading) {
    return (
      <main style={{ padding: 16 }}>
        <div style={{ fontWeight: 900 }}>Loading…</div>
      </main>
    );
  }

  if (error || !game || !team1 || !team2) {
    return (
      <main style={{ padding: 16, maxWidth: 900, margin: "0 auto" }}>
        <h1 style={{ fontSize: 22, fontWeight: 950 }}>Game</h1>
        <div style={{ color: "crimson", fontWeight: 800 }}>{error ?? "Missing data"}</div>
        <a href="/" style={{ fontWeight: 900, textDecoration: "none" }}>
          ← Back
        </a>
      </main>
    );
  }

  const offenseSide: Side = state.offenseSide;
  const defenseSide: Side = offenseSide === "A" ? "B" : "A";

  const offensePlayers = offenseSide === "A" ? players1 : players2;
  const defensePlayers = offenseSide === "A" ? players2 : players1;

  const offenseTeamName = offenseSide === "A" ? team1.name : team2.name;

  const allPlayersA = players1;
  const allPlayersB = players2;

  const btn: React.CSSProperties = { padding: 16, borderRadius: 14, border: "1px solid #ddd", fontWeight: 900 };
  const btnWide: React.CSSProperties = { width: "100%", padding: 14, borderRadius: 14, border: "1px solid #ddd", fontWeight: 900 };

  return (
    <main style={{ padding: 16, maxWidth: 950, margin: "0 auto" }}>
      <h1 style={{ marginTop: 0, fontSize: 22, fontWeight: 950 }}>
        {team1.name} vs {team2.name}
      </h1>

      <div style={{ fontWeight: 950, opacity: 0.9 }}>
        Score: {team1.name} {state.scoreA} — {state.scoreB} {team2.name}
      </div>
      <div style={{ opacity: 0.8 }}>Current Yardline: {state.ballSpot}</div>
      <div style={{ opacity: 0.8 }}>
        Down &amp; Distance: {ordinalDown(state.down)} &amp; {Math.round(state.toGo)}
      </div>
      <div style={{ opacity: 0.8 }}>
        Line to gain: {state.lineToGain} (attacking {state.direction === -1 ? "→ 0" : "→ 50"})
      </div>
      <div style={{ opacity: 0.8 }}>Possession: {offenseTeamName}</div>

      <div style={{ marginTop: 8, padding: 12, border: "1px solid #eee", borderRadius: 14 }}>
        <div style={{ fontWeight: 950 }}>State: {state.phase}</div>
        <div style={{ opacity: 0.8 }}>Carrier: {state.carrier ? playerNameById[state.carrier] : "—"}</div>

        <div style={{ marginTop: 10, fontWeight: 950 }}>Draft log</div>
        <div style={{ whiteSpace: "pre-wrap", opacity: 0.9 }}>{prettyLog(state.draft.log)}</div>

        <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            onClick={() => dispatch({ type: "UNDO" })}
            disabled={state.history.length === 0 || state.ended}
            style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #ddd", fontWeight: 900 }}
          >
            UNDO
          </button>

          <button
            onClick={() => dispatch({ type: "HALFTIME_SWITCH_SIDES" })}
            disabled={state.phase !== "S0_SNAP" || state.ended}
            style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #ddd", fontWeight: 900 }}
          >
            HALFTIME / Switch Sides
          </button>

          <button
            onClick={() => dispatch({ type: "END_GAME" })}
            disabled={state.phase !== "S0_SNAP" || state.ended}
            style={{
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid #ddd",
              fontWeight: 900,
              background: "#111",
              color: "#fff",
            }}
          >
            END GAME
          </button>
        </div>
      </div>

      {!state.ended && (
        <>
      {/* (0) Snapper */}
      {state.phase === "S0_SNAP" && (
        <section style={{ marginTop: 14, padding: 12, border: "1px solid #eee", borderRadius: 14 }}>
          <div style={{ fontWeight: 950 }}>Snapper / Play start: choose offense carrier</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginTop: 10 }}>
            {offensePlayers.map((p) => (
              <button
                key={p.id}
                onClick={() => dispatch({ type: "SET_SNAP_CARRIER", playerId: p.id, side: offenseSide })}
                style={{ padding: 16, borderRadius: 14, border: "1px solid #ddd", fontWeight: 900 }}
              >
                {p.name}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Conversion choose 1/2 */}
      {state.phase === "S16_CONV_CHOOSE_TRY" && (
        <section style={{ marginTop: 14, display: "grid", gap: 10 }}>
          <div style={{ fontWeight: 950 }}>Conversion attempt: choose 1 or 2</div>
          <button onClick={() => dispatch({ type: "CONV_CHOOSE_TRY", pts: 1 })} style={btn}>1-pt attempt</button>
          <button onClick={() => dispatch({ type: "CONV_CHOOSE_TRY", pts: 2 })} style={btn}>2-pt attempt</button>
        </section>
      )}

      {/* Conversion choose scorer */}
      {state.phase === "S17_CONV_CHOOSE_SCORER" && (
        <section style={{ marginTop: 14, padding: 12, border: "1px solid #eee", borderRadius: 14 }}>
          <div style={{ fontWeight: 950 }}>Who scored the conversion? (offense or defense)</div>

          <div style={{ marginTop: 10, fontWeight: 900, opacity: 0.8 }}>{team1.name}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginTop: 8 }}>
            {allPlayersA.map((p) => (
              <button key={p.id} onClick={() => dispatch({ type: "CONV_SCORE_PLAYER", playerId: p.id, side: "A" })} style={btn}>
                {p.name}
              </button>
            ))}
          </div>

          <div style={{ marginTop: 12, fontWeight: 900, opacity: 0.8 }}>{team2.name}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginTop: 8 }}>
            {allPlayersB.map((p) => (
              <button key={p.id} onClick={() => dispatch({ type: "CONV_SCORE_PLAYER", playerId: p.id, side: "B" })} style={btn}>
                {p.name}
              </button>
            ))}
          </div>

          <button onClick={() => dispatch({ type: "CONV_FAILED" })} style={{ ...btnWide, marginTop: 10 }}>
            Nobody / FAILED
          </button>
        </section>
      )}

      {/* Safety kick kicker */}
      {state.phase === "S18_SAFETY_KICK_KICKER" && (
        <section style={{ marginTop: 14, padding: 12, border: "1px solid #eee", borderRadius: 14 }}>
          <div style={{ fontWeight: 950 }}>Safety kick: who kicked?</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginTop: 10 }}>
            {offensePlayers.map((p) => (
              <button key={p.id} onClick={() => dispatch({ type: "SAFETY_KICK_SET_KICKER", playerId: p.id, side: offenseSide })} style={btn}>
                {p.name}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Safety kick returner / downed */}
      {state.phase === "S19_SAFETY_KICK_RETURNER" && (
        <section style={{ marginTop: 14, padding: 12, border: "1px solid #eee", borderRadius: 14 }}>
          <div style={{ fontWeight: 950 }}>Safety kick: who returned/downed?</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginTop: 10 }}>
            {defensePlayers.map((p) => (
              <button
                key={p.id}
                onClick={() => dispatch({ type: "SAFETY_KICK_SET_RETURNER", playerId: p.id, side: defenseSide })}
                style={btn}
              >
                {p.name}
              </button>
            ))}
          </div>

          <button onClick={() => dispatch({ type: "SAFETY_KICK_DOWN" })} style={{ ...btnWide, marginTop: 10 }}>
            Downed (no return)
          </button>
        </section>
      )}

      {/* (1) Pre-pass */}
      {state.phase === "S1_PREPASS" && (
        <section style={{ marginTop: 14, display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
          <button onClick={() => dispatch({ type: "GO_PREPASS_LATERAL" })} style={btn}>Lateral → (11)</button>
          <button onClick={() => dispatch({ type: "GO_TARGET_Q" })} style={btn}>Target / Forward Pass → (4)</button>
          <button onClick={() => dispatch({ type: "GO_SACK_Q" })} style={btn}>Down / Sack → (8)</button>
          <button onClick={() => dispatch({ type: "GO_PUNT" })} style={btn}>Punt → (10)</button>
          <button onClick={() => dispatch({ type: "GO_FUMBLE" })} style={{ ...btn, gridColumn: "1 / -1" }}>
            Fumble → Turnover → (14)
          </button>
        </section>
      )}

      {/* (2) Post-pass */}
      {state.phase === "S2_POSTPASS" && (
        <section style={{ marginTop: 14, display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
          <button onClick={() => dispatch({ type: "GO_POSTPASS_LATERAL" })} style={btn}>Lateral → (12)</button>
          <button onClick={() => dispatch({ type: "GO_DOWN_END" })} style={btn}>Down → (9)</button>
          <button onClick={() => dispatch({ type: "GO_FUMBLE_FROM_POSTPASS" })} style={{ ...btn, gridColumn: "1 / -1" }}>
            Fumble → Turnover → (14)
          </button>
        </section>
      )}

      {/* (3) Def carrier */}
      {state.phase === "S3_DEF_CARRIER" && (
        <section style={{ marginTop: 14, display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
          <button onClick={() => dispatch({ type: "GO_DEF_LATERAL" })} style={btn}>Lateral → (13)</button>
          <button onClick={() => dispatch({ type: "GO_DOWN_END_FROM_DEF" })} style={btn}>Down → (9)</button>
          <button onClick={() => dispatch({ type: "GO_DEF_FUMBLE" })} style={{ ...btn, gridColumn: "1 / -1" }}>
            Fumble → Turnover (back) → (15)
          </button>
        </section>
      )}

      {/* (4) Target? */}
      {state.phase === "S4_TARGET_Q" && (
        <section style={{ marginTop: 14, padding: 12, border: "1px solid #eee", borderRadius: 14 }}>
          <div style={{ fontWeight: 950 }}>Target? (pick offense) → (5) OR none → (6)</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginTop: 10 }}>
            {offensePlayers.map((p) => (
              <button key={p.id} onClick={() => dispatch({ type: "SET_PASS_TARGET", playerId: p.id })} style={btn}>
                {p.name}
              </button>
            ))}
          </div>
          <button onClick={() => dispatch({ type: "TARGET_NONE" })} style={{ ...btnWide, marginTop: 10 }}>
            None → (6)
          </button>
        </section>
      )}

      {/* (5) Complete? */}
      {state.phase === "S5_COMPLETE_Q" && (
        <section style={{ marginTop: 14, display: "grid", gap: 10 }}>
          <button onClick={() => dispatch({ type: "PASS_COMPLETE" })} style={btn}>Complete → (2)</button>
          <button onClick={() => dispatch({ type: "PASS_INCOMPLETE" })} style={btn}>Incomplete → (6)</button>
        </section>
      )}

      {/* (6) Deflect? */}
      {state.phase === "S6_DEFLECT_Q" && (
        <section style={{ marginTop: 14, padding: 12, border: "1px solid #eee", borderRadius: 14 }}>
          <div style={{ fontWeight: 950 }}>Deflect? (pick defense) → (7) OR none → (7)</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginTop: 10 }}>
            {defensePlayers.map((p) => (
              <button key={p.id} onClick={() => dispatch({ type: "SET_DEFLECTOR", playerId: p.id })} style={btn}>
                {p.name}
              </button>
            ))}
          </div>
          <button onClick={() => dispatch({ type: "DEFLECT_NONE" })} style={{ ...btnWide, marginTop: 10 }}>
            None → (7)
          </button>
        </section>
      )}

      {/* (7) Intercept? */}
      {state.phase === "S7_INTERCEPT_Q" && (
        <section style={{ marginTop: 14, padding: 12, border: "1px solid #eee", borderRadius: 14 }}>
          <div style={{ fontWeight: 950 }}>Intercept? (pick defense) → (3) OR none → (9)</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginTop: 10 }}>
            {defensePlayers.map((p) => (
              <button key={p.id} onClick={() => dispatch({ type: "SET_INTERCEPTOR", playerId: p.id, side: defenseSide })} style={btn}>
                {p.name}
              </button>
            ))}
          </div>
          <button onClick={() => dispatch({ type: "INTERCEPT_NONE" })} style={{ ...btnWide, marginTop: 10 }}>
            None → (9)
          </button>
        </section>
      )}

      {/* (8) Sack? */}
      {state.phase === "S8_SACK_Q" && (
        <section style={{ marginTop: 14, padding: 12, border: "1px solid #eee", borderRadius: 14 }}>
          <div style={{ fontWeight: 950 }}>Sack? (pick defense) → (9) OR none → (9)</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginTop: 10 }}>
            {defensePlayers.map((p) => (
              <button key={p.id} onClick={() => dispatch({ type: "SET_SACKER", playerId: p.id })} style={btn}>
                {p.name}
              </button>
            ))}
          </div>
          <button onClick={() => dispatch({ type: "SACK_NONE" })} style={{ ...btnWide, marginTop: 10 }}>
            None → (9)
          </button>
        </section>
      )}

      {/* (10) Punt */}
      {state.phase === "S10_PUNT" && (
        <section style={{ marginTop: 14, padding: 12, border: "1px solid #eee", borderRadius: 14 }}>
          <div style={{ fontWeight: 950 }}>Punt: down → (9) OR pick defense carrier → (3)</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginTop: 10 }}>
            {defensePlayers.map((p) => (
              <button key={p.id} onClick={() => dispatch({ type: "PUNT_PICK_DEF_CARRIER", playerId: p.id, side: defenseSide })} style={btn}>
                {p.name}
              </button>
            ))}
          </div>
          <button onClick={() => dispatch({ type: "PUNT_DOWN" })} style={{ ...btnWide, marginTop: 10 }}>
            Down → (9)
          </button>
        </section>
      )}

      {/* (11) Pre-pass lateral */}
      {state.phase === "S11_PREPASS_LATERAL" && (
        <section style={{ marginTop: 14, padding: 12, border: "1px solid #eee", borderRadius: 14 }}>
          <div style={{ fontWeight: 950 }}>Pre-pass lateral: pick offense → (1)</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginTop: 10 }}>
            {offensePlayers.map((p) => (
              <button key={p.id} onClick={() => dispatch({ type: "SET_PREPASS_LATERAL_TARGET", playerId: p.id, side: offenseSide })} style={btn}>
                {p.name}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* (12) Post-pass lateral */}
      {state.phase === "S12_POSTPASS_LATERAL" && (
        <section style={{ marginTop: 14, padding: 12, border: "1px solid #eee", borderRadius: 14 }}>
          <div style={{ fontWeight: 950 }}>Post-pass lateral: pick offense → (2)</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginTop: 10 }}>
            {offensePlayers.map((p) => (
              <button key={p.id} onClick={() => dispatch({ type: "SET_POSTPASS_LATERAL_TARGET", playerId: p.id, side: offenseSide })} style={btn}>
                {p.name}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* (13) Defense lateral */}
      {state.phase === "S13_DEF_LATERAL" && (
        <section style={{ marginTop: 14, padding: 12, border: "1px solid #eee", borderRadius: 14 }}>
          <div style={{ fontWeight: 950 }}>Defense lateral: pick defense → (3)</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginTop: 10 }}>
            {defensePlayers.map((p) => (
              <button key={p.id} onClick={() => dispatch({ type: "SET_DEF_LATERAL_TARGET", playerId: p.id, side: defenseSide })} style={btn}>
                {p.name}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* (14) Fumble */}
      {state.phase === "S14_FUMBLE" && (
        <section style={{ marginTop: 14, padding: 12, border: "1px solid #eee", borderRadius: 14 }}>
          <div style={{ fontWeight: 950 }}>Fumble: pick defense recoverer → (3)</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginTop: 10 }}>
            {defensePlayers.map((p) => (
              <button key={p.id} onClick={() => dispatch({ type: "SET_FUMBLE_RECOVER_DEF", playerId: p.id, side: defenseSide })} style={btn}>
                {p.name}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* (15) Defense fumble */}
      {state.phase === "S15_DEF_FUMBLE" && (
        <section style={{ marginTop: 14, padding: 12, border: "1px solid #eee", borderRadius: 14 }}>
          <div style={{ fontWeight: 950 }}>Defense fumble: pick offense recoverer → (2)</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginTop: 10 }}>
            {offensePlayers.map((p) => (
              <button key={p.id} onClick={() => dispatch({ type: "SET_FUMBLE_RECOVER_OFF", playerId: p.id, side: offenseSide })} style={btn}>
                {p.name}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* (9) Down / end of play */}
      {state.phase === "S9_DOWN_END" && (
        <section style={{ marginTop: 14, padding: 12, border: "1px solid #eee", borderRadius: 14 }}>
          <div style={{ fontWeight: 950 }}>Down / End of play: enter end yardline → next</div>
          <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
            <input
              type="number"
              min={-1}
              max={51}
              value={state.draft.end_ydline}
              onChange={(e) => dispatch({ type: "SET_END_YDLINE", endYdline: parseInt(e.target.value || "0", 10) })}
              style={{ flex: 1, padding: 12, borderRadius: 12, border: "1px solid #ddd" }}
            />
            <button
              onClick={() => {
                dispatch({ type: "CONFIRM_END_YDLINE_TO_LOG" });
                dispatch({ type: "RESET_TO_S0" });
              }}
              style={{ padding: 12, borderRadius: 12, border: "1px solid #ddd", fontWeight: 900 }}
            >
              Confirm
            </button>
          </div>
        </section>
      )}

        </>
      )}

      {state.ended && (
        <section style={{ marginTop: 14, padding: 12, border: "1px solid #eee", borderRadius: 14 }}>
          <div style={{ fontWeight: 950, fontSize: 18 }}>FINAL</div>
          <div style={{ marginTop: 6, fontWeight: 900 }}>
            {team1.name} {state.scoreA} — {state.scoreB} {team2.name}
          </div>

          <div style={{ marginTop: 14, fontWeight: 950 }}>{team1.name} Box Score</div>
          <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
            {players1.map((p) => {
              const s = statsByPlayer[p.id] ?? emptyPlayerStats();
              return (
                <div key={p.id} style={{ padding: 10, borderRadius: 12, border: "1px solid #f1f1f1" }}>
                  <div style={{ fontWeight: 900 }}>{p.name}</div>
                  <div style={{ opacity: 0.85 }}>
                    Pass: {s.passCompletions}/{s.passAttempts} | Rec: {s.receptions} | TD: {s.touchdowns} | 1pt: {s.conversions1} | 2pt: {s.conversions2} | INT: {s.interceptions} | Defl: {s.deflections} | Sacks: {s.sacks} | Punts: {s.punts}
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ marginTop: 14, fontWeight: 950 }}>{team2.name} Box Score</div>
          <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
            {players2.map((p) => {
              const s = statsByPlayer[p.id] ?? emptyPlayerStats();
              return (
                <div key={p.id} style={{ padding: 10, borderRadius: 12, border: "1px solid #f1f1f1" }}>
                  <div style={{ fontWeight: 900 }}>{p.name}</div>
                  <div style={{ opacity: 0.85 }}>
                    Pass: {s.passCompletions}/{s.passAttempts} | Rec: {s.receptions} | TD: {s.touchdowns} | 1pt: {s.conversions1} | 2pt: {s.conversions2} | INT: {s.interceptions} | Defl: {s.deflections} | Sacks: {s.sacks} | Punts: {s.punts}
                  </div>
                </div>
              );
            })}
          </div>

          <button
            onClick={() => window.print()}
            style={{ marginTop: 14, padding: "10px 12px", borderRadius: 12, border: "1px solid #ddd", fontWeight: 900 }}
          >
            Print / Save Box Score
          </button>
        </section>
      )}

      {/* Play Log */}
      <section style={{ marginTop: 14, padding: 12, border: "1px solid #eee", borderRadius: 14 }}>
        <div style={{ fontWeight: 950 }}>Game Log</div>
        {state.playLog.length === 0 ? (
          <div style={{ opacity: 0.7, marginTop: 8 }}>No plays confirmed yet.</div>
        ) : (
          <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
            {state.playLog.map((line, i) => (
              <div key={i} style={{ padding: 10, borderRadius: 12, border: "1px solid #f1f1f1" }}>
                {prettyLog(line)}
              </div>
            ))}
          </div>
        )}
      </section>

      <div style={{ marginTop: 14 }}>
        <a href="/" style={{ fontWeight: 900, textDecoration: "none" }}>
          ← Back
        </a>
      </div>
    </main>
  );
}
