import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  FileChartColumn,
  Filter,
  Pencil,
  RefreshCw,
  Search,
  Trophy,
  UserRound,
  X,
} from "lucide-react";
import { Layout } from "../components/Layout";
import { PageSkeleton } from "../components/Skeleton";
import { useAuth } from "../context/AuthContext";
import { useRoster } from "../context/RosterContext";
import { SHEET_ID, TABS } from "../config";
import { clearSheetReadCache, readSheet, writeRange } from "../lib/sheets";
import { matchOnlineTournamentResults } from "../lib/onlineTournamentMatch";
import {
  rowToSavedWeeklyOnlineTournament,
  type SavedWeeklyOnlineTournament,
} from "../lib/weeklyOnlineTournament";
import {
  fetchChessComMonthlyStats,
  fetchChessComWeeklyStats,
  fetchLichessMonthlyStats,
  fetchLichessWeeklyStats,
  fetchOnlineProfileRatings,
  type MonthlyOnlineStats,
  type OnlineProfileRatings,
} from "../lib/onlineChessStats";
import type { Student } from "../types";
import { useToast } from "../context/ToastContext";

const emptyStats: MonthlyOnlineStats = {
  games: 0,
  wins: 0,
  draws: 0,
  losses: 0,
};
const currentMonth = new Date().toISOString().slice(0, 7);
const currentDate = new Date().toISOString().slice(0, 10);

function ratingForOnline(student: Student): number {
  return (
    Number(
      student.ratingRapid || student.ratingClassical || student.ratingBlitz,
    ) || 0
  );
}

function profileUrl(platform: "chess" | "lichess", username: string) {
  return platform === "chess"
    ? `https://www.chess.com/member/${encodeURIComponent(username)}`
    : `https://lichess.org/@/${encodeURIComponent(username)}`;
}

function RatingLine({
  label,
  value,
}: Readonly<{ label: string; value?: number }>) {
  return (
    <span className="flex justify-between gap-3 text-xs">
      <span className="text-gray-500 dark:text-gray-400">{label}</span>
      <strong>{value ?? "—"}</strong>
    </span>
  );
}

export function OnlineChess() {
  const { token } = useAuth();
  const {
    students,
    loading: rosterLoading,
    updateStudentInRoster,
  } = useRoster();
  const toast = useToast();
  const navigate = useNavigate();
  const [weeklyResults, setWeeklyResults] = useState<
    SavedWeeklyOnlineTournament[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Student | null>(null);
  const [ratings, setRatings] = useState<OnlineProfileRatings | null>(null);
  const [ratingsLoading, setRatingsLoading] = useState(false);
  const [month, setMonth] = useState(currentMonth);
  const [weekDate, setWeekDate] = useState(currentDate);
  const [reportPeriod, setReportPeriod] = useState<"weekly" | "monthly">(
    "monthly",
  );
  const [monthlyStats, setMonthlyStats] = useState<{
    chess: MonthlyOnlineStats;
    lichess: MonthlyOnlineStats;
  }>({ chess: emptyStats, lichess: emptyStats });
  const [monthlyLoading, setMonthlyLoading] = useState(false);
  const [dataFetched, setDataFetched] = useState(false);
  const [fetchMessage, setFetchMessage] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "rating">("name");
  const [linkedOnly, setLinkedOnly] = useState(false);
  const [editingIds, setEditingIds] = useState(false);
  const [chessComUsername, setChessComUsername] = useState("");
  const [lichessUsername, setLichessUsername] = useState("");
  const [savingIds, setSavingIds] = useState(false);

  useEffect(() => {
    if (!token) return;
    readSheet(token, SHEET_ID, `'${TABS.WEEKLY_ONLINE_TOURNAMENTS}'!A:N`)
      .then((rows) =>
        setWeeklyResults(
          rows
            .slice(1)
            .map((row, index) =>
              rowToSavedWeeklyOnlineTournament(row, index + 2),
            ),
        ),
      )
      .catch(() => setWeeklyResults([]))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    if (!selected) {
      setRatings(null);
      setEditingIds(false);
      setDataFetched(false);
      setFetchMessage("");
      return;
    }
    setChessComUsername(selected.chessComUsername);
    setLichessUsername(selected.lichessUsername);
  }, [selected]);

  const saveIds = async () => {
    if (!token || !selected) return;
    const chessCom = chessComUsername.trim();
    const lichess = lichessUsername.trim();
    if (chessCom.length > 25 || lichess.length > 20) {
      toast.error(
        "Chess.com usernames are limited to 25 characters and Lichess usernames to 20 characters.",
      );
      return;
    }
    setSavingIds(true);
    try {
      await writeRange(
        token,
        SHEET_ID,
        `'${TABS.STUDENTS}'!AE${selected.rowIndex}:AF${selected.rowIndex}`,
        [[chessCom, lichess]],
      );
      clearSheetReadCache(SHEET_ID);
      const updated = {
        ...selected,
        chessComUsername: chessCom,
        lichessUsername: lichess,
      };
      updateStudentInRoster(updated);
      setSelected(updated);
      setEditingIds(false);
      toast.success("Online chess IDs updated successfully.");
    } catch (error: any) {
      if (error.message === "TOKEN_EXPIRED") return;
      toast.error(`Save failed: ${error.message}`);
    } finally {
      setSavingIds(false);
    }
  };

  const fetchLiveData = async () => {
    if (!selected) return;
    setRatingsLoading(true);
    setMonthlyLoading(true);
    setFetchMessage("");
    try {
      const [nextRatings, chess, lichess] = await Promise.all([
        fetchOnlineProfileRatings(
          selected.chessComUsername,
          selected.lichessUsername,
        ),
        reportPeriod === "monthly"
          ? fetchChessComMonthlyStats(selected.chessComUsername, month).catch(
              () => emptyStats,
            )
          : fetchChessComWeeklyStats(selected.chessComUsername, weekDate).catch(
              () => emptyStats,
            ),
        reportPeriod === "monthly"
          ? fetchLichessMonthlyStats(selected.lichessUsername, month).catch(
              () => emptyStats,
            )
          : fetchLichessWeeklyStats(selected.lichessUsername, weekDate).catch(
              () => emptyStats,
            ),
      ]);
      setRatings(nextRatings);
      setMonthlyStats({ chess, lichess });
      setDataFetched(true);
      const totalGames = chess.games + lichess.games;
      setFetchMessage(
        totalGames === 0
          ? `No games were found for this ${reportPeriod === "monthly" ? "month" : "week"}. Ratings were fetched separately.`
          : "Live ratings and game results are ready.",
      );
      toast.success(`Live ratings and ${reportPeriod} report fetched.`);
    } finally {
      setRatingsLoading(false);
      setMonthlyLoading(false);
    }
  };

  const copyProfile = async () => {
    if (!selected || !ratings) return;
    const reportLabel =
      reportPeriod === "monthly" ? month : `week of ${weekDate}`;
    const text = [
      `${selected.name} - Online Chess Profile`,
      `Chess.com ID: ${selected.chessComUsername || "Not linked"}`,
      `Lichess ID: ${selected.lichessUsername || "Not linked"}`,
      "",
      `Chess.com ratings: Rapid ${ratings.chessCom.rapid ?? "-"}, Blitz ${ratings.chessCom.blitz ?? "-"}, Bullet ${ratings.chessCom.bullet ?? "-"}`,
      `Lichess ratings: Rapid ${ratings.lichess.rapid ?? "-"}, Blitz ${ratings.lichess.blitz ?? "-"}, Bullet ${ratings.lichess.bullet ?? "-"}`,
      "",
      `${reportLabel} report:`,
      `Chess.com: ${monthlyStats.chess.games} games, ${monthlyStats.chess.wins} wins, ${monthlyStats.chess.draws} draws, ${monthlyStats.chess.losses} losses`,
      `Lichess: ${monthlyStats.lichess.games} games, ${monthlyStats.lichess.wins} wins, ${monthlyStats.lichess.draws} draws, ${monthlyStats.lichess.losses} losses`,
    ].join("\n");
    await navigator.clipboard?.writeText(text);
    toast.success("Profile ratings and report copied.");
  };

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
  const visibleStudents = activeStudents
    .filter((student) => {
      const query = search.trim().toLowerCase();
      const linked =
        !linkedOnly || student.chessComUsername || student.lichessUsername;
      return (
        Boolean(linked) &&
        (!query ||
          [
            student.name,
            student.batch,
            student.coachName,
            student.chessComUsername,
            student.lichessUsername,
          ].some((value) => value.toLowerCase().includes(query)))
      );
    })
    .sort((left, right) =>
      sortBy === "name"
        ? left.name.localeCompare(right.name)
        : ratingForOnline(right) - ratingForOnline(left),
    );
  const matchedResults = selected
    ? matchOnlineTournamentResults(weeklyResults, [selected])
    : [];
  const academyStats = matchedResults.reduce(
    (stats, result) => {
      const score = Number.parseFloat(result.score) || 0;
      stats.events += 1;
      stats.points += score;
      stats.ratingChanges += 0;
      return stats;
    },
    { events: 0, points: 0, ratingChanges: 0 },
  );

  if (rosterLoading && students.length === 0)
    return (
      <Layout title="Online Chess">
        <PageSkeleton />
      </Layout>
    );
  if (loading && weeklyResults.length === 0)
    return (
      <Layout title="Online Chess">
        <PageSkeleton />
      </Layout>
    );

  return (
    <Layout title="Online Chess">
      <div className="page-stack p-4 md:p-6 max-w-6xl mx-auto">
        <section className="surface-card p-4 md:p-5">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-3">
            <div>
              <p className="online-directory-eyebrow text-xs uppercase tracking-wide font-bold">
                Player directory
              </p>
              <h2 className="text-xl font-bold text-navy dark:text-gray-100">
                Online Chess IDs
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Open a student profile, visit either platform, and review online
                activity.
              </p>
            </div>
            <label className="relative w-full md:w-80">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                aria-hidden="true"
              />
              <input
                className="input pl-9"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search students or IDs"
                aria-label="Search online chess directory"
              />
            </label>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3 dark:border-gray-800">
            <button
              type="button"
              className={`secondary-action py-1.5 px-2.5 text-xs ${linkedOnly ? "border-gold text-gold" : ""}`}
              onClick={() => setLinkedOnly((value) => !value)}
            >
              <Filter size={14} />
              {linkedOnly ? "Linked only" : "All students"}
            </button>
            <label className="secondary-action py-1.5 px-2.5 text-xs">
              Sort
              <select
                className="bg-transparent font-semibold outline-none"
                value={sortBy}
                onChange={(event) =>
                  setSortBy(event.target.value as "name" | "rating")
                }
                aria-label="Sort online students"
              >
                <option value="name">Name</option>
                <option value="rating">Rating</option>
              </select>
            </label>
            <span className="ml-auto text-xs text-gray-500">
              {visibleStudents.length} players
            </span>
          </div>
        </section>

        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {visibleStudents.map((student) => (
            <button
              key={student.rowIndex}
              type="button"
              onClick={() => setSelected(student)}
              className="surface-card text-left p-4 hover:border-gold transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <span>
                  <strong className="block text-sm text-gray-900 dark:text-gray-100">
                    {student.name}
                  </strong>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {student.batch || "No batch"}
                    {student.coachName ? ` · ${student.coachName}` : ""}
                  </span>
                </span>
                <UserRound
                  size={17}
                  className="text-gold shrink-0"
                  aria-hidden="true"
                />
              </div>
              <div className="mt-3 space-y-1 text-xs">
                <span className="block">
                  Chess.com:{" "}
                  <strong>{student.chessComUsername || "Not linked"}</strong>
                </span>
                <span className="block">
                  Lichess:{" "}
                  <strong>{student.lichessUsername || "Not linked"}</strong>
                </span>
              </div>
            </button>
          ))}
        </section>
        <section className="surface-card p-3 flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-gray-500">
            Report range
          </span>
          <select
            className="input w-auto py-1.5 text-xs"
            value={reportPeriod}
            onChange={(event) => {
              setReportPeriod(event.target.value as "weekly" | "monthly");
              setDataFetched(false);
            }}
            aria-label="Report period"
          >
            <option value="monthly">Monthly</option>
            <option value="weekly">Weekly</option>
          </select>
          {reportPeriod === "monthly" ? (
            <input
              type="month"
              value={month}
              onChange={(event) => {
                setMonth(event.target.value);
                setDataFetched(false);
              }}
              className="input w-auto py-1.5 text-xs"
              aria-label="Report month"
            />
          ) : (
            <input
              type="date"
              value={weekDate}
              onChange={(event) => {
                setWeekDate(event.target.value);
                setDataFetched(false);
              }}
              className="input w-auto py-1.5 text-xs"
              aria-label="Report week"
            />
          )}
          <span className="text-xs text-gray-500">
            Choose a range, then fetch data from the student profile.
          </span>
        </section>
        {visibleStudents.length === 0 && (
          <div className="surface-card p-8 text-center text-sm text-gray-500">
            No active students match this search.
          </div>
        )}

        {selected && (
          <div
            className="modal-backdrop items-center justify-center p-4"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setSelected(null);
            }}
          >
            <div
              className="modal-panel w-full max-w-2xl max-h-[90vh] overflow-y-auto p-5"
              role="dialog"
              aria-modal="true"
              aria-labelledby="online-student-dialog-title"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="online-directory-eyebrow text-xs uppercase tracking-wide font-bold">
                    Online chess profile
                  </p>
                  <h2
                    id="online-student-dialog-title"
                    className="text-xl font-bold text-navy dark:text-gray-100"
                  >
                    {selected.name}
                  </h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {selected.batch || "No batch"}
                    {selected.coachName ? ` · ${selected.coachName}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="icon-button"
                  aria-label="Close online chess profile"
                >
                  <X size={19} />
                </button>
              </div>
              <div className="profile-action-grid mt-5">
                <button
                  type="button"
                  onClick={() => void fetchLiveData()}
                  className="primary-action"
                  disabled={ratingsLoading || monthlyLoading}
                >
                  <RefreshCw
                    size={16}
                    className={
                      ratingsLoading || monthlyLoading ? "animate-spin" : ""
                    }
                  />
                  {ratingsLoading || monthlyLoading
                    ? "Fetching…"
                    : "Fetch live data"}
                </button>
                <button
                  type="button"
                  aria-label="Visit student profile"
                  onClick={() =>
                    navigate(
                      `/students?student=${encodeURIComponent(selected.name)}`,
                    )
                  }
                  className="secondary-action justify-center"
                >
                  <UserRound size={16} />
                  Student profile
                </button>
                {selected.chessComUsername && (
                  <a
                    className="secondary-action justify-center"
                    href={profileUrl("chess", selected.chessComUsername)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ExternalLink size={16} />
                    Chess.com
                  </a>
                )}
                {selected.lichessUsername && (
                  <a
                    className="secondary-action justify-center"
                    href={profileUrl("lichess", selected.lichessUsername)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ExternalLink size={16} />
                    Lichess
                  </a>
                )}
                {dataFetched && ratings && (
                  <button
                    type="button"
                    className="secondary-action justify-center"
                    onClick={() => void copyProfile()}
                  >
                    <Copy size={16} />
                    Copy profile
                  </button>
                )}
              </div>
              <section className="surface-card p-4 mt-3">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <h3 className="font-bold text-sm">Platform IDs</h3>
                  {!editingIds && (
                    <button
                      type="button"
                      className="icon-button"
                      aria-label="Edit platform IDs"
                      title="Edit platform IDs"
                      onClick={() => setEditingIds(true)}
                    >
                      <Pencil size={14} />
                    </button>
                  )}
                </div>
                {editingIds ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="text-xs font-semibold">
                      Chess.com
                      <input
                        className="input mt-1"
                        maxLength={25}
                        value={chessComUsername}
                        onChange={(event) =>
                          setChessComUsername(event.target.value)
                        }
                      />
                    </label>
                    <label className="text-xs font-semibold">
                      Lichess
                      <input
                        className="input mt-1"
                        maxLength={20}
                        value={lichessUsername}
                        onChange={(event) =>
                          setLichessUsername(event.target.value)
                        }
                      />
                    </label>
                    <div className="sm:col-span-2 flex justify-end gap-2">
                      <button
                        type="button"
                        className="secondary-action"
                        onClick={() => setEditingIds(false)}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="primary-action"
                        disabled={savingIds}
                        onClick={() => void saveIds()}
                      >
                        <Check size={16} />
                        {savingIds ? "Saving…" : "Save IDs"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    <span>
                      Chess.com:{" "}
                      <strong>
                        {selected.chessComUsername || "Not linked"}
                      </strong>
                    </span>
                    <span>
                      Lichess:{" "}
                      <strong>
                        {selected.lichessUsername || "Not linked"}
                      </strong>
                    </span>
                  </div>
                )}
              </section>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-5">
                <div className="surface-card p-4">
                  <h3 className="font-bold text-sm flex items-center gap-2 mb-3">
                    <Trophy size={16} className="text-gold" />
                    Current ratings
                  </h3>
                  {!dataFetched && (
                    <p className="text-xs text-gray-500">
                      Click Fetch live data to contact Chess.com and Lichess.
                    </p>
                  )}
                  {dataFetched && !ratingsLoading && (
                    <div className="space-y-1.5">
                      <p className="text-xs font-bold text-navy dark:text-gray-100">
                        Chess.com
                      </p>
                      <RatingLine
                        label="Rapid"
                        value={ratings?.chessCom.rapid}
                      />
                      <RatingLine
                        label="Blitz"
                        value={ratings?.chessCom.blitz}
                      />
                      <RatingLine
                        label="Bullet"
                        value={ratings?.chessCom.bullet}
                      />
                      <p className="text-xs font-bold text-navy dark:text-gray-100 pt-2">
                        Lichess
                      </p>
                      <RatingLine
                        label="Rapid"
                        value={ratings?.lichess.rapid}
                      />
                      <RatingLine
                        label="Blitz"
                        value={ratings?.lichess.blitz}
                      />
                      <RatingLine
                        label="Bullet"
                        value={ratings?.lichess.bullet}
                      />
                    </div>
                  )}
                </div>
                <div className="surface-card p-4">
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <h3 className="font-bold text-sm flex items-center gap-2">
                      <FileChartColumn size={16} className="text-gold" />
                      {reportPeriod === "monthly" ? "Monthly" : "Weekly"} report
                    </h3>
                    {reportPeriod === "monthly" ? (
                      <input
                        type="month"
                        value={month}
                        onChange={(event) => {
                          setMonth(event.target.value);
                          setDataFetched(false);
                        }}
                        className="input w-auto py-1 text-xs"
                        aria-label="Report month"
                      />
                    ) : (
                      <input
                        type="date"
                        value={weekDate}
                        onChange={(event) => {
                          setWeekDate(event.target.value);
                          setDataFetched(false);
                        }}
                        className="input w-auto py-1 text-xs"
                        aria-label="Report week"
                      />
                    )}
                  </div>
                  {!dataFetched ? (
                    <p className="text-xs text-gray-500">
                      Games, wins, draws and losses appear after a manual fetch.
                    </p>
                  ) : monthlyLoading ? (
                    <p className="text-xs text-gray-500">Loading games…</p>
                  ) : (
                    <div className="space-y-3">
                      <MonthlyStatBlock
                        label="Chess.com"
                        stats={monthlyStats.chess}
                      />
                      <MonthlyStatBlock
                        label="Lichess"
                        stats={monthlyStats.lichess}
                      />
                      <div className="flex gap-2 pt-2">
                        <button
                          type="button"
                          className="secondary-action py-1.5 px-2.5 text-xs"
                          onClick={() =>
                            void navigator.clipboard?.writeText(
                              `${selected.name} online report\n${month}\nChess.com: ${monthlyStats.chess.games} games, ${monthlyStats.chess.wins} wins, ${monthlyStats.chess.losses} losses\nLichess: ${monthlyStats.lichess.games} games, ${monthlyStats.lichess.wins} wins, ${monthlyStats.lichess.losses} losses`,
                            )
                          }
                        >
                          <Copy size={14} />
                          Copy report
                        </button>
                        <button
                          type="button"
                          className="secondary-action py-1.5 px-2.5 text-xs"
                          onClick={() => window.print()}
                        >
                          <Download size={14} />
                          Print / PDF
                        </button>
                      </div>
                    </div>
                  )}
                  {dataFetched && fetchMessage && (
                    <p className="mt-3 rounded-lg border border-amber-300/40 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/20 dark:text-amber-200">
                      {fetchMessage}
                    </p>
                  )}
                  <p className="text-[11px] text-gray-500 mt-3">
                    Fetch is manual so opening profiles never contacts external
                    sites.
                  </p>
                </div>
              </div>
              <div className="surface-card p-4 mt-3">
                <h3 className="font-bold text-sm mb-2">
                  Academy tracked results
                </h3>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <strong className="block text-lg">
                      {academyStats.events}
                    </strong>
                    <span className="text-xs text-gray-500">events</span>
                  </div>
                  <div>
                    <strong className="block text-lg">
                      {academyStats.points}
                    </strong>
                    <span className="text-xs text-gray-500">points</span>
                  </div>
                  <div>
                    <strong className="block text-lg">
                      {matchedResults.length
                        ? Math.min(
                            ...matchedResults.map((result) => result.rank),
                          )
                        : "—"}
                    </strong>
                    <span className="text-xs text-gray-500">best rank</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}

function MonthlyStatBlock({
  label,
  stats,
}: Readonly<{ label: string; stats: MonthlyOnlineStats }>) {
  const difference = stats.ratingDifference;
  return (
    <div>
      <p className="text-xs font-bold text-navy dark:text-gray-100 mb-1">
        {label}
      </p>
      <div className="grid grid-cols-5 gap-1 text-center">
        <div>
          <strong className="block text-sm">{stats.games}</strong>
          <span className="text-[10px] text-gray-500">games</span>
        </div>
        <div>
          <strong className="block text-sm text-green-600">{stats.wins}</strong>
          <span className="text-[10px] text-gray-500">won</span>
        </div>
        <div>
          <strong className="block text-sm">{stats.draws}</strong>
          <span className="text-[10px] text-gray-500">draw</span>
        </div>
        <div>
          <strong className="block text-sm text-red-600">{stats.losses}</strong>
          <span className="text-[10px] text-gray-500">lost</span>
        </div>
        <div>
          <strong
            className={`block text-sm ${difference === undefined ? "" : difference >= 0 ? "text-green-600" : "text-red-600"}`}
          >
            {difference === undefined
              ? "—"
              : `${difference >= 0 ? "+" : ""}${difference}`}
          </strong>
          <span className="text-[10px] text-gray-500">rating</span>
        </div>
      </div>
    </div>
  );
}
