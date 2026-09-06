import { useEffect, useMemo, useState } from "react";
import {
  Check,
  ChevronRight,
  Copy,
  Download,
  Pencil,
  Play,
  Plus,
  Swords,
  Trash2,
  Trophy,
  Users,
} from "lucide-react";
import { Layout } from "../components/Layout";
import { PageSkeleton } from "../components/Skeleton";
import { useAuth } from "../context/AuthContext";
import { useRoster } from "../context/RosterContext";
import { useToast } from "../context/ToastContext";
import { useCoachName } from "../hooks/useCoachName";
import { SHEET_ID } from "../config";
import {
  createMiniTournamentSession,
  deleteMiniTournamentSession,
  ensureMiniTournamentSheet,
  loadMiniTournamentSessions,
  saveMiniTournamentSession,
  updateMiniTournamentDetails,
  type MiniTournamentSession,
} from "../lib/miniTournamentStore";
import {
  applyRoundResults,
  computeStandings,
  createInitialHistory,
  generateNextRound,
  type GameResult,
  type PairingParticipant,
} from "../lib/pairingEngine";
import type { Student } from "../types";

const RESULT_OPTIONS: { value: GameResult; label: string }[] = [
  { value: "", label: "—" },
  { value: "1-0", label: "1-0" },
  { value: "0-1", label: "0-1" },
  { value: "1/2-1/2", label: "Draw" },
];

type ConfirmationRequest = {
  title: string;
  message: string;
  confirmLabel: string;
  action: () => void | Promise<void>;
};

function ratingFor(student: Student): number {
  const value = Number.parseInt(
    student.ratingRapid || student.ratingClassical || student.ratingBlitz,
    10,
  );
  return Number.isFinite(value) && value > 0 ? value : 1000;
}

// Only folds rounds where every board has a recorded result — an in-progress
// round with pending boards is intentionally excluded so standings never throw
// while results are still being entered.
function historyFromSession(session: MiniTournamentSession) {
  let history = createInitialHistory(session.participants);
  session.rounds.forEach((round) => {
    const complete = round.every(
      (board) => board.black === null || board.result,
    );
    if (complete) history = applyRoundResults(history, round);
  });
  return history;
}

export function MiniTournament() {
  const { token } = useAuth();
  const { students, loading: rosterLoading } = useRoster();
  const { coachName } = useCoachName();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState<MiniTournamentSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [selectedNames, setSelectedNames] = useState<string[]>([]);
  const [manualPlayerName, setManualPlayerName] = useState("");
  const [batchFilter, setBatchFilter] = useState("all");
  const [creating, setCreating] = useState(false);
  const [savingRound, setSavingRound] = useState(false);
  const [mode, setMode] = useState<"individual" | "team">("individual");
  const [teamSize, setTeamSize] = useState(2);
  const [ratingMode, setRatingMode] = useState<"rated" | "casual">("rated");
  const [sessionFilter, setSessionFilter] = useState<"active" | "archive">(
    "active",
  );
  const [editingSession, setEditingSession] = useState(false);
  const [confirmation, setConfirmation] = useState<ConfirmationRequest | null>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        await ensureMiniTournamentSheet(token, SHEET_ID);
        const loaded = await loadMiniTournamentSessions(token, SHEET_ID);
        setSessions(loaded);
        const active = loaded.find((session) => session.status === "active");
        if (active) setActiveSessionId(active.sessionId);
      } catch {
        toast.error("Could not load mini tournament sessions.");
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const activeStudents = useMemo(
    () =>
      students
        .filter(
          (student) =>
            !student.status.trim() ||
            student.status.trim().toLowerCase() === "active",
        )
        .sort((left, right) => left.name.localeCompare(right.name)),
    [students],
  );
  const batches = useMemo(
    () => Array.from(new Set(activeStudents.map((student) => student.batch.trim()).filter(Boolean))).sort(),
    [activeStudents],
  );
  const visibleStudents = useMemo(
    () =>
      batchFilter === "all"
        ? activeStudents
        : activeStudents.filter((student) => student.batch.trim() === batchFilter),
    [activeStudents, batchFilter],
  );

  const activeSession =
    sessions.find((session) => session.sessionId === activeSessionId) ?? null;
  const history = activeSession ? historyFromSession(activeSession) : null;
  const currentRound = activeSession
    ? (activeSession.rounds[activeSession.rounds.length - 1] ?? null)
    : null;
  const roundComplete = currentRound
    ? currentRound.every((board) => board.black === null || board.result)
    : false;
  const standings =
    activeSession && history
      ? computeStandings(activeSession.participants, history)
      : [];

  const toggleSelected = (studentName: string) => {
    if (selectedNames.includes(studentName)) {
      setConfirmation({
        title: "Remove player?",
        message: `Remove ${studentName} from this tournament?`,
        confirmLabel: "Remove player",
        action: () => {
          setSelectedNames((prev) => prev.filter((nameValue) => nameValue !== studentName));
        },
      });
      return;
    }
    setSelectedNames((prev) => [...prev, studentName]);
  };

  const addManualPlayer = () => {
    const playerName = manualPlayerName.trim();
    if (!playerName) return;
    const normalizedName = playerName.toLowerCase();
    if (activeStudents.some((student) => student.name.toLowerCase() === normalizedName)) {
      toast.error("This player is already in the roster. Select their roster entry instead.");
      return;
    }
    if (selectedNames.some((nameValue) => nameValue.toLowerCase() === normalizedName)) {
      toast.error("This player is already selected.");
      return;
    }
    setSelectedNames((prev) => [...prev, playerName]);
    setManualPlayerName("");
  };

  const createSession = async () => {
    if (!token) return;
    if (!name.trim()) {
      toast.error("Give this mini tournament a name.");
      return;
    }
    if (selectedNames.length < 2) {
      toast.error("Select at least 2 students to pair.");
      return;
    }
    setCreating(true);
    try {
      const selectedPlayers = selectedNames.map((studentName) => {
        const student = activeStudents.find((item) => item.name === studentName);
        return { name: studentName, rating: student ? ratingFor(student) : 1000 };
      });
      const groups =
        mode === "team"
          ? Array.from(
              { length: Math.ceil(selectedPlayers.length / teamSize) },
              (_, index) =>
                selectedPlayers.slice(
                  index * teamSize,
                  (index + 1) * teamSize,
                ),
            )
          : selectedPlayers.map((player) => [player]);
      const participants: PairingParticipant[] = groups.map((group) => ({
        name:
          mode === "team"
            ? group.map((player) => player.name).join(" / ")
            : group[0].name,
          rating:
            ratingMode === "casual"
              ? 0
              : Math.round(
                  group.reduce((total, player) => total + player.rating, 0) /
                    group.length,
                ),
      }));
      const initialHistory = createInitialHistory(participants);
      const firstRound = generateNextRound(participants, initialHistory, 1);
      const sessionId = `mt-${Date.now()}`;
      const session: Omit<MiniTournamentSession, "rowIndex"> = {
        sessionId,
        name: name.trim(),
        date: new Date().toISOString().slice(0, 10),
        status: "active",
        mode,
        teamSize,
        ratingMode,
        participants,
        rounds: [firstRound],
      };
      const rowIndex = await createMiniTournamentSession(
        token,
        SHEET_ID,
        session,
        coachName || "Coach",
      );
      setSessions((prev) => [...prev, { ...session, rowIndex }]);
      setActiveSessionId(sessionId);
      setShowCreate(false);
      setName("");
      setSelectedNames([]);
      setManualPlayerName("");
      setBatchFilter("all");
      setMode("individual");
      setRatingMode("rated");
      toast.success("Mini tournament created. Round 1 pairings are ready.");
    } catch (error: any) {
      if (error.message === "TOKEN_EXPIRED") return;
      toast.error(`Could not create tournament: ${error.message}`);
    } finally {
      setCreating(false);
    }
  };

  const updateResult = (board: number, result: GameResult) => {
    if (!activeSession) return;
    const rounds = activeSession.rounds.map((round, index) =>
      index !== activeSession.rounds.length - 1
        ? round
        : round.map((pairing) =>
            pairing.board === board ? { ...pairing, result } : pairing,
          ),
    );
    const updated = { ...activeSession, rounds };
    setSessions((prev) =>
      prev.map((session) =>
        session.sessionId === updated.sessionId ? updated : session,
      ),
    );
  };

  const persistSession = async (session: MiniTournamentSession) => {
    if (!token) return;
    try {
      await saveMiniTournamentSession(token, SHEET_ID, session);
    } catch (error: any) {
      if (error.message === "TOKEN_EXPIRED") return;
      toast.error(`Could not save changes: ${error.message}`);
    }
  };

  const startNextRound = async () => {
    if (!activeSession || !history || !currentRound) return;
    setSavingRound(true);
    try {
      const nextRound = generateNextRound(
        activeSession.participants,
        history,
        activeSession.rounds.length + 1,
      );
      const updated = {
        ...activeSession,
        rounds: [...activeSession.rounds, nextRound],
      };
      setSessions((prev) =>
        prev.map((session) =>
          session.sessionId === updated.sessionId ? updated : session,
        ),
      );
      await persistSession(updated);
      toast.success(`Round ${updated.rounds.length} pairings are ready.`);
    } finally {
      setSavingRound(false);
    }
  };

  const requestNextRound = () => {
    if (!activeSession) return;
    setConfirmation({
      title: "Start next round?",
      message: "The current results will be saved and new pairings will be created.",
      confirmLabel: "Start next round",
      action: startNextRound,
    });
  };

  const finishTournament = async () => {
    if (!activeSession) return;
    setSavingRound(true);
    try {
      const updated: MiniTournamentSession = {
        ...activeSession,
        status: "completed",
      };
      setSessions((prev) =>
        prev.map((session) =>
          session.sessionId === updated.sessionId ? updated : session,
        ),
      );
      await persistSession(updated);
      setActiveSessionId(null);
      toast.success("Mini tournament completed.");
    } finally {
      setSavingRound(false);
    }
  };

  const deleteTournament = async (session: MiniTournamentSession) => {
    if (!token) return;
    await deleteMiniTournamentSession(token, SHEET_ID, session.rowIndex);
    setSessions((prev) =>
      prev.filter((item) => item.sessionId !== session.sessionId),
    );
    setActiveSessionId(null);
    toast.success("Tournament removed.");
  };

  const requestFinish = () => {
    if (!activeSession) return;
    setConfirmation({
      title: "Finish tournament?",
      message: `Mark "${activeSession.name}" as completed? Final standings will be locked in.`,
      confirmLabel: "Finish tournament",
      action: finishTournament,
    });
  };

  const requestDelete = (session: MiniTournamentSession) => {
    setConfirmation({
      title: "Delete tournament?",
      message: `Delete "${session.name}"? This clears its tournament row permanently.`,
      confirmLabel: "Delete tournament",
      action: () => deleteTournament(session),
    });
  };

  const confirmAction = async () => {
    if (!confirmation) return;
    setConfirming(true);
    try {
      await confirmation.action();
      setConfirmation(null);
    } finally {
      setConfirming(false);
    }
  };

  const updateSession = async () => {
    if (!token || !activeSession || !name.trim()) return;
    const participants = activeSession.participants.map((participant) => ({
      ...participant,
      rating:
        ratingMode === "casual"
          ? 0
          : Math.round(
              participant.name.split(" / ").reduce((total, studentName) => {
                const student = activeStudents.find((item) => item.name === studentName);
                return total + (student ? ratingFor(student) : 1000);
              }, 0) /
                participant.name.split(" / ").length,
            ),
    }));
    const updated = { ...activeSession, name: name.trim(), ratingMode, participants };
    await updateMiniTournamentDetails(token, SHEET_ID, updated);
    setSessions((prev) =>
      prev.map((item) =>
        item.sessionId === updated.sessionId ? updated : item,
      ),
    );
    setEditingSession(false);
    toast.success("Tournament details updated.");
  };

  if (rosterLoading && students.length === 0)
    return (
      <Layout title="Mini Tournament">
        <PageSkeleton />
      </Layout>
    );
  if (loading)
    return (
      <Layout title="Mini Tournament">
        <PageSkeleton />
      </Layout>
    );

  return (
    <Layout title="Mini Tournament">
      <div className="page-stack p-4 md:p-6 max-w-5xl mx-auto">
        {!activeSession && (
          <section className="surface-card p-4 md:p-5">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-gold font-bold">
                  In-class pairing
                </p>
                <h2 className="text-xl font-bold text-navy dark:text-gray-100">
                  Mini Tournament Pairing
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  Pick students, pair them by rating or casually, and record
                  results round by round without repeated pairings.
                </p>
              </div>
              <button
                type="button"
                className="primary-action"
                onClick={() => setShowCreate(true)}
              >
                <Plus size={16} />
                New mini tournament
              </button>
            </div>
          </section>
        )}

        {!activeSession && sessions.length > 0 && (
          <section className="surface-card p-4 tournament-list-panel">
            <div className="flex items-center justify-between gap-2 mb-2">
              <h3 className="font-bold text-sm">Tournament list</h3>
              <label className="text-xs font-semibold">
                View
                <select
                  className="ml-1 rounded-lg border border-gray-200 bg-transparent p-1"
                  value={sessionFilter}
                  onChange={(event) =>
                    setSessionFilter(event.target.value as "active" | "archive")
                  }
                  aria-label="Tournament list filter"
                >
                  <option value="active">Active</option>
                  <option value="archive">Archive</option>
                </select>
              </label>
            </div>
            <div className="space-y-2">
              {sessions
                .filter((session) =>
                  sessionFilter === "archive"
                    ? session.status === "completed"
                    : session.status === "active",
                )
                .map((session) => (
                  <button
                    key={session.sessionId}
                    type="button"
                    onClick={() => setActiveSessionId(session.sessionId)}
                    className="tournament-list-row w-full flex items-center justify-between gap-3 text-left text-sm"
                  >
                    <span className="min-w-0">
                      <strong className="block truncate">{session.name}</strong>
                      <span className="text-xs text-gray-500">
                        {session.mode === "team" ? "Team" : "Individual"} ·{" "}
                        {session.ratingMode === "casual" ? "Casual" : "Rated"} ·{" "}
                        {session.date} · {session.rounds.length} round(s)
                      </span>
                    </span>
                    <ChevronRight size={16} className="text-gray-400" />
                  </button>
                ))}
            </div>
          </section>
        )}

        {showCreate && (
          <div
            className="modal-backdrop items-center justify-center p-4"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setShowCreate(false);
            }}
          >
            <div
              className="modal-panel w-full max-w-xl max-h-[90vh] overflow-y-auto p-5"
              role="dialog"
              aria-modal="true"
              aria-labelledby="mini-tournament-create-title"
            >
              <h2
                id="mini-tournament-create-title"
                className="text-lg font-bold text-navy dark:text-gray-100 mb-3"
              >
                New mini tournament
              </h2>
              <label className="block text-xs font-semibold mb-1">Name</label>
              <input
                className="input w-full mb-3"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. Saturday Rapid Round Robin"
                aria-label="Tournament name"
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
                <label className="text-xs font-semibold sm:order-1">
                  Format
                  <select
                    className="input mt-1"
                    value={mode}
                    onChange={(event) =>
                      setMode(event.target.value as "individual" | "team")
                    }
                    aria-label="Tournament format"
                  >
                    <option value="individual">Individual</option>
                    <option value="team">Team tournament</option>
                  </select>
                </label>
                {mode === "team" && (
                  <label className="text-xs font-semibold sm:order-3">
                    Players per team
                    <select
                      className="input mt-1"
                      value={teamSize}
                      onChange={(event) =>
                        setTeamSize(Number(event.target.value))
                      }
                      aria-label="Players per team"
                    >
                      <option value="2">2 players</option>
                      <option value="3">3 players</option>
                      <option value="4">4 players</option>
                    </select>
                  </label>
                )}
                <label className="text-xs font-semibold sm:order-2">
                  Rating mode
                  <select
                    className="input mt-1"
                    value={ratingMode}
                    onChange={(event) =>
                      setRatingMode(event.target.value as "rated" | "casual")
                    }
                    aria-label="Tournament rating mode"
                  >
                    <option value="rated">Rated (use ratings)</option>
                    <option value="casual">Casual (ratings optional)</option>
                  </select>
                </label>
              </div>
              <p className="text-xs font-semibold mb-2">
                Select participants ({selectedNames.length} selected)
              </p>
              <div className="flex flex-col sm:flex-row gap-2 mb-2">
                <label className="sr-only" htmlFor="tournament-batch-filter">
                  Filter players by batch
                </label>
                <select
                  id="tournament-batch-filter"
                  className="input flex-1"
                  value={batchFilter}
                  onChange={(event) => setBatchFilter(event.target.value)}
                  aria-label="Filter players by batch"
                >
                  <option value="all">All batches</option>
                  {batches.map((batch) => (
                    <option key={batch} value={batch}>
                      {batch}
                    </option>
                  ))}
                </select>
                <div className="flex flex-1 gap-2">
                  <label className="sr-only" htmlFor="manual-tournament-player">
                    Add player manually
                  </label>
                  <input
                    id="manual-tournament-player"
                    className="input min-w-0 flex-1"
                    value={manualPlayerName}
                    onChange={(event) => setManualPlayerName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        addManualPlayer();
                      }
                    }}
                    placeholder="Add player manually"
                    aria-label="Add player manually"
                  />
                  <button
                    type="button"
                    className="secondary-action shrink-0"
                    onClick={addManualPlayer}
                    title="Add player manually"
                  >
                    <Plus size={15} />
                    Add
                  </button>
                </div>
              </div>
              {selectedNames.some(
                (selectedName) => !activeStudents.some((student) => student.name === selectedName),
              ) && (
                <div className="mb-2">
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">
                    Manual players
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                  {selectedNames
                    .filter((selectedName) => !activeStudents.some((student) => student.name === selectedName))
                    .map((selectedName) => (
                      <button
                        key={selectedName}
                        type="button"
                        className="secondary-action text-xs"
                        onClick={() => toggleSelected(selectedName)}
                        title={`Remove ${selectedName}`}
                      >
                        {selectedName} ×
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-64 overflow-y-auto mb-4">
                {visibleStudents.map((student) => {
                  const checked = selectedNames.includes(student.name);
                  return (
                    <button
                      key={student.rowIndex}
                      type="button"
                      onClick={() => toggleSelected(student.name)}
                      className={`flex items-center justify-between gap-2 text-left text-sm px-3 py-2 rounded-lg border transition-colors ${checked ? "border-gold bg-amber-50 dark:bg-amber-950/20" : "border-gray-200 dark:border-slate-700"}`}
                    >
                      <span>{student.name}</span>
                      {checked && (
                        <Check
                          size={16}
                          className="text-gold shrink-0"
                          aria-hidden="true"
                        />
                      )}
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  className="secondary-action"
                  onClick={() => setShowCreate(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="primary-action"
                  disabled={creating}
                  onClick={() => void createSession()}
                >
                  <Play size={16} />
                  {creating ? "Creating…" : "Create & pair round 1"}
                </button>
              </div>
            </div>
          </div>
        )}

        {activeSession && currentRound && (
          <>
            <section className="surface-card p-4 md:p-5 tournament-header">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-gold font-bold">
                    Round {activeSession.rounds.length}
                  </p>
                  <h2 className="text-xl font-bold text-navy dark:text-gray-100 flex items-center gap-2">
                    <Swords size={20} className="text-gold" />
                    {activeSession.name}
                  </h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    {activeSession.participants.length} players ·{" "}
                    {activeSession.date}
                  </p>
                </div>
                <div className="tournament-toolbar">
                  <button
                    type="button"
                    className="secondary-action"
                    onClick={() => setActiveSessionId(null)}
                  >
                    <Users size={16} />
                    All sessions
                  </button>
                  {activeSession.status === "active" && (
                    <button
                      type="button"
                      className="secondary-action"
                      onClick={() => {
                        setName(activeSession.name);
                        setRatingMode(activeSession.ratingMode);
                        setEditingSession(true);
                      }}
                    >
                      <Pencil size={16} />
                      Edit
                    </button>
                  )}
                  <button
                    type="button"
                    className="secondary-action text-red-600"
                    onClick={() => requestDelete(activeSession)}
                  >
                    <Trash2 size={16} />
                    Delete
                  </button>
                  {activeSession.status === "active" && (
                    <button
                      type="button"
                      className="secondary-action finish-action"
                      onClick={requestFinish}
                    >
                      <Trophy size={16} />
                      Finish
                    </button>
                  )}
                </div>
              </div>
            </section>

            <section className="surface-card p-4">
              <h3 className="font-bold text-sm mb-3">Boards</h3>
              <div className="tournament-pairing-headings" aria-hidden="true">
                <span>White</span>
                <span>Result</span>
                <span>Black</span>
              </div>
              <div className="space-y-2">
                {currentRound.map((board) => (
                  <div
                    key={board.board}
                    className="tournament-board tournament-pairing-row"
                  >
                    <span className="tournament-board-number">Board {board.board}</span>
                    {board.black === null ? (
                      <span className="tournament-player tournament-player-white">
                        <strong>{board.white}</strong>
                      </span>
                    ) : (
                      <>
                        <span className="tournament-player tournament-player-white">
                          <strong>{board.white}</strong>
                        </span>
                        <select
                          className="input tournament-result-select"
                          value={board.result}
                          disabled={activeSession.status !== "active"}
                          onChange={(event) =>
                            updateResult(
                              board.board,
                              event.target.value as GameResult,
                            )
                          }
                          aria-label={`Result for board ${board.board}`}
                        >
                          {RESULT_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                        <span className="tournament-player tournament-player-black">
                          <strong>{board.black}</strong>
                        </span>
                      </>
                    )}
                  </div>
                ))}
              </div>
              {activeSession.status === "active" && (
                <div className="tournament-result-actions mt-4">
                  <button
                    type="button"
                    className="primary-action"
                    disabled={!roundComplete || savingRound}
                    onClick={requestNextRound}
                  >
                    <ChevronRight size={16} />
                    Next round
                  </button>
                </div>
              )}
            </section>

            <section className="surface-card p-4">
              <h3 className="font-bold text-sm mb-3">Standings</h3>
              <div className="overflow-x-auto">
                <table className="standings-table w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-gray-500">
                      <th className="pb-2">#</th>
                      <th className="pb-2">Player</th>
                      <th className="pb-2">Rating</th>
                      <th className="pb-2">Points</th>
                      <th className="pb-2">Games</th>
                    </tr>
                  </thead>
                  <tbody>
                    {standings.map((row) => (
                      <tr
                        key={row.name}
                        className="border-t border-gray-100 dark:border-slate-800"
                      >
                        <td className="py-1.5">{row.rank}</td>
                        <td className="py-1.5 font-medium">{row.name}</td>
                        <td className="py-1.5">
                          {activeSession.ratingMode === "casual" ? "—" : row.rating}
                        </td>
                        <td className="py-1.5 font-bold">{row.points}</td>
                        <td className="py-1.5">{row.games}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
            {activeSession.status === "completed" && (
              <section className="surface-card p-4">
                <div className="archive-actions">
                  <span className="badge-green">Read-only archive</span>
                  <button
                    type="button"
                    className="secondary-action"
                    onClick={() =>
                      void navigator.clipboard?.writeText(
                        JSON.stringify(activeSession, null, 2),
                      )
                    }
                  >
                    <Copy size={15} />
                    Copy archive
                  </button>
                  <button
                    type="button"
                    className="secondary-action"
                    onClick={() => window.print()}
                  >
                    <Download size={15} />
                    Print / PDF
                  </button>
                </div>
              </section>
            )}
          </>
        )}
        {editingSession && (
          <div className="modal-backdrop items-center justify-center p-4">
            <div
              className="modal-panel w-full max-w-sm p-5"
              role="dialog"
              aria-modal="true"
              aria-labelledby="edit-tournament-title"
            >
              <h2 id="edit-tournament-title" className="text-lg font-bold mb-3">
                Edit tournament
              </h2>
              <input
                className="input w-full mb-4"
                value={name}
                onChange={(event) => setName(event.target.value)}
                aria-label="Tournament name"
              />
              <label className="mb-4 block text-xs font-semibold">
                Rating mode
                <select
                  className="input mt-1"
                  value={ratingMode}
                  onChange={(event) =>
                    setRatingMode(event.target.value as "rated" | "casual")
                  }
                  aria-label="Tournament rating mode"
                >
                  <option value="rated">Rated (use ratings)</option>
                  <option value="casual">Casual (ratings optional)</option>
                </select>
              </label>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  className="secondary-action"
                  onClick={() => setEditingSession(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="primary-action"
                  onClick={() => void updateSession()}
                >
                  Save changes
                </button>
              </div>
            </div>
          </div>
        )}
        {confirmation && (
          <div
            className="modal-backdrop items-center justify-center p-4"
            role="presentation"
            onMouseDown={(event) => {
              if (!confirming && event.target === event.currentTarget) setConfirmation(null);
            }}
          >
            <div
              className="modal-panel w-full max-w-sm p-5"
              role="dialog"
              aria-modal="true"
              aria-labelledby="confirmation-title"
            >
              <h2 id="confirmation-title" className="text-lg font-bold mb-2">
                {confirmation.title}
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-300 mb-5">
                {confirmation.message}
              </p>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  className="secondary-action"
                  disabled={confirming}
                  onClick={() => setConfirmation(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="primary-action"
                  disabled={confirming}
                  onClick={() => void confirmAction()}
                >
                  {confirming ? "Working…" : confirmation.confirmLabel}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
