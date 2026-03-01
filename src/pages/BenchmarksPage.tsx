import { useCallback } from "react";
import {
  DownloadSimple,
  Trash,
  CalendarBlank,
  Clock,
  Lightning,
} from "@phosphor-icons/react";
import { useBenchmarkDB, type BenchmarkEntry } from "@/hooks/useBenchmarkDB";
import "./BenchmarksPage.css";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const fmtAgents = (n: number) =>
  n >= 1000 ? `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}K` : String(n);

const fmtMethodClean = (m: string) => {
  const [method, render] = m.split("/");
  return render && render !== "none" ? `${method} (${render})` : method;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const BenchmarksPage = () => {
  const { entries, getReportBlob, deleteBenchmark } = useBenchmarkDB();

  const handleDownload = useCallback(
    async (entry: BenchmarkEntry) => {
      const blob = await getReportBlob(entry.id);
      if (!blob) return;
      const slug =
        entry.label
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "") || "benchmark";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${slug}_benchmark_${entry.id.slice(0, 8)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    },
    [getReportBlob],
  );

  const handleDelete = useCallback(
    (id: string) => {
      deleteBenchmark(id);
    },
    [deleteBenchmark],
  );

  return (
    <div className="benchmarks-page">
      <div className="benchmarks-page-header">
        <Lightning size={16} weight="fill" />
        <h1>All Benchmark Runs</h1>
        <span className="benchmarks-page-count">
          {entries.length} {entries.length === 1 ? "run" : "runs"}
        </span>
      </div>

      {entries.length === 0 ? (
        <div className="benchmarks-page-empty">
          No benchmark runs recorded yet. Run a benchmark from the Home page to
          see results here.
        </div>
      ) : (
        <div className="benchmarks-page-list">
          {entries.map((entry) => {
            const d = new Date(entry.timestamp);
            const date = d.toLocaleDateString(undefined, {
              year: "numeric",
              month: "short",
              day: "numeric",
            });
            const time = d.toLocaleTimeString(undefined, {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            });
            const cleanMethods = entry.methods.map(fmtMethodClean);
            const agentRange =
              entry.agentCounts.length > 1
                ? `${fmtAgents(Math.min(...entry.agentCounts))}–${fmtAgents(Math.max(...entry.agentCounts))}`
                : fmtAgents(entry.agentCounts[0] ?? 0);
            return (
              <div key={entry.id} className="benchmarks-page-card">
                <div className="benchmarks-page-card-main">
                  <div className="benchmarks-page-card-name">{entry.label}</div>
                  <div className="benchmarks-page-card-meta">
                    <CalendarBlank size={11} weight="bold" />
                    <span>{date}</span>
                    <Clock size={11} weight="bold" />
                    <span>{time}</span>
                  </div>
                  <div className="benchmarks-page-card-stats">
                    <span className="benchmarks-page-pill">
                      {cleanMethods.join(", ")}
                    </span>
                    <span className="benchmarks-page-pill">
                      {agentRange} agents
                    </span>
                    <span className="benchmarks-page-pill">
                      {entry.frameCount} frames
                    </span>
                  </div>
                </div>
                <div className="benchmarks-page-card-actions">
                  <button
                    className="benchmarks-page-btn"
                    onClick={() => handleDownload(entry)}
                    title="Download"
                  >
                    <DownloadSimple size={14} weight="bold" />
                  </button>
                  <button
                    className="benchmarks-page-btn delete"
                    onClick={() => handleDelete(entry.id)}
                    title="Delete"
                  >
                    <Trash size={14} weight="bold" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
