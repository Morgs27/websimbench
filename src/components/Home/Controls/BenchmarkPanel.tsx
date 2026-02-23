import { useCallback, useState } from "react";
import {
  Play,
  Stop,
  DownloadSimple,
  Trash,
  Timer,
  Lightning,
  CalendarBlank,
  Clock,
  Users,
  Cpu,
} from "@phosphor-icons/react";
import { Method } from "@websimbench/agentyx";
import type {
  BenchmarkConfig,
  BenchmarkProgress,
  BenchmarkResult,
  BenchmarkStatus,
} from "@/hooks/useBenchmark";
import type { BenchmarkEntry } from "@/hooks/useBenchmarkDB";
import "./BenchmarkPanel.css";
import { FileText, Frame, Wrench } from "lucide-react";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ALL_METHODS: { value: Method; label: string }[] = [
  { value: "JavaScript", label: "JavaScript" },
  { value: "WebWorkers", label: "WebWorkers" },
  { value: "WebAssembly", label: "WebAssembly" },
  { value: "WebGPU", label: "WebGPU" },
];

const CAPTURE_TOGGLES: {
  key: keyof NonNullable<BenchmarkConfig["tracking"]>;
  label: string;
}[] = [
  { key: "captureLogs", label: "Capture Logs" },
  { key: "captureDeviceMetrics", label: "Device Metrics" },
  { key: "captureFrameInputs", label: "Frame Inputs" },
  { key: "captureAgentStates", label: "Agent States" },
  { key: "captureRawArrays", label: "Raw Arrays (trailMap, randomValues)" },
];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface BenchmarkPanelProps {
  config: BenchmarkConfig;
  updateConfig: <K extends keyof BenchmarkConfig>(
    key: K,
    value: BenchmarkConfig[K],
  ) => void;
  status: BenchmarkStatus;
  progress: BenchmarkProgress | null;
  result: BenchmarkResult | null;
  onRun: () => void;
  onStop: () => void;
  onDownload: (index: number) => void;
  onSave: () => void;
  // Recent benchmarks
  recentEntries: BenchmarkEntry[];
  onDownloadRecent: (id: string) => void;
  onDeleteRecent: (id: string) => void;
  canRun: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const BenchmarkPanel = ({
  config,
  updateConfig,
  status,
  progress,
  result,
  onRun,
  onStop,
  onDownload,
  recentEntries,
  onDownloadRecent,
  onDeleteRecent,
  canRun,
}: BenchmarkPanelProps) => {
  const isRunning = status === "running";
  const isComplete = status === "complete";

  // --- Agent counts as editable string ---
  const [agentCountsStr, setAgentCountsStr] = useState(
    config.agentCounts.join(", "),
  );

  // --- Worker counts as editable string ---
  const [workerCountsStr, setWorkerCountsStr] = useState(
    config.extras.workerCounts.join(", "),
  );

  const handleAgentCountsBlur = useCallback(() => {
    const parsed = agentCountsStr
      .split(/[,\s]+/)
      .map((s) => parseInt(s, 10))
      .filter((n) => Number.isFinite(n) && n > 0);
    if (parsed.length > 0) {
      updateConfig("agentCounts", parsed);
    }
  }, [agentCountsStr, updateConfig]);

  const handleWorkerCountsBlur = useCallback(() => {
    const parsed = workerCountsStr
      .split(/[,\s]+/)
      .map((s) => parseInt(s, 10))
      .filter((n) => Number.isFinite(n) && n > 0);
    if (parsed.length > 0) {
      updateConfig("extras", {
        ...config.extras,
        workerCounts: parsed,
      });
    }
  }, [workerCountsStr, config.extras, updateConfig]);

  const toggleMethod = useCallback(
    (method: Method) => {
      const next = config.methods.includes(method)
        ? config.methods.filter((m) => m !== method)
        : [...config.methods, method];
      if (next.length > 0) updateConfig("methods", next);
    },
    [config.methods, updateConfig],
  );

  const toggleTrackingOpt = useCallback(
    (key: keyof NonNullable<BenchmarkConfig["tracking"]>) => {
      updateConfig("tracking", {
        ...config.tracking,
        [key]: !config.tracking[key],
      });
    },
    [config.tracking, updateConfig],
  );

  // Progress fraction
  const progressFraction =
    progress && progress.totalFrames > 0
      ? ((progress.completedRuns * progress.totalFrames +
          progress.currentFrame) /
          (progress.totalRuns * progress.totalFrames)) *
        100
      : 0;

  return (
    <div className="benchmark-panel" onClick={(e) => e.stopPropagation()}>
      <div className="benchmark-panel-title">
        <Lightning size={14} weight="fill" />
        Benchmark Configuration
      </div>

      <p className="benchmark-panel-description">
        Run benchmarks within your browser to compare performance across
        different configurations for your simulation.
      </p>

      {/* ─── Recent Benchmarks ───────────────────────────── */}
      <div className="benchmark-section">
        <div className="benchmark-section-label">
          <Clock size={14} weight="bold" />
          Recent Benchmarks
        </div>

        {/* ─── Recent Benchmarks (horizontal cards) ────── */}
        {recentEntries.length > 0 ? (
          <div className="benchmark-recent-strip">
            {recentEntries.map((entry) => {
              const d = new Date(entry.timestamp);
              const date = d.toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              });
              const time = d.toLocaleTimeString(undefined, {
                hour: "2-digit",
                minute: "2-digit",
              });
              return (
                <div key={entry.id} className="benchmark-recent-card">
                  <div className="benchmark-recent-card-row">
                    <CalendarBlank
                      className="benchmark-recent-card-date"
                      size={10}
                      weight="bold"
                    />
                    <span className="benchmark-recent-card-date">{date}</span>
                    <Clock size={10} weight="bold" />
                    <span>{time}</span>
                  </div>
                  <div className="benchmark-recent-card-detail">
                    {entry.methods.join(", ")}
                  </div>
                  <div className="benchmark-recent-card-actions">
                    <button
                      className="benchmark-recent-card-btn"
                      onClick={() => onDownloadRecent(entry.id)}
                      title="Download"
                    >
                      <DownloadSimple size={11} weight="bold" />
                    </button>
                    <button
                      className="benchmark-recent-card-btn delete"
                      onClick={() => onDeleteRecent(entry.id)}
                      title="Delete"
                    >
                      <Trash size={11} weight="bold" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="benchmark-recent-strip">
            <span className="no-recent-benchmarks">No recent benchmarks</span>
          </div>
        )}
      </div>

      {/* ─── Agent Counts ──────────────────────────────── */}
      <div className="benchmark-section">
        <div className="benchmark-section-label">
          <Users size={14} weight="bold" />
          Agent Counts
        </div>
        <div className="benchmark-field">
          <label className="benchmark-field-label">
            Comma-separated agent counts
          </label>
          <input
            className="benchmark-field-input"
            value={agentCountsStr}
            onChange={(e) => setAgentCountsStr(e.target.value)}
            onBlur={handleAgentCountsBlur}
            disabled={isRunning}
            placeholder="1000, 5000, 10000"
          />
        </div>
      </div>

      {/* ─── Methods ───────────────────────────────────── */}
      <div className="benchmark-section">
        <div className="benchmark-section-label">
          <Cpu size={14} weight="bold" />
          Compute Methods
        </div>
        <div className="benchmark-methods-grid">
          {ALL_METHODS.map((m) => (
            <div key={m.value} className="benchmark-checkbox-row">
              <input
                type="checkbox"
                className="benchmark-checkbox"
                id={`method-${m.value}`}
                checked={config.methods.includes(m.value)}
                onChange={() => toggleMethod(m.value)}
                disabled={isRunning}
              />
              <label
                className="benchmark-checkbox-label"
                htmlFor={`method-${m.value}`}
              >
                {m.label}
              </label>
            </div>
          ))}
        </div>
      </div>

      {/* ─── Frames ────────────────────────────────────── */}
      <div className="benchmark-section">
        <div className="benchmark-section-label">
          <Frame size={14} />
          Frames
        </div>
        <div className="benchmark-field">
          <label className="benchmark-field-label">Number of frames</label>
          <input
            type="number"
            className="benchmark-field-input"
            value={config.frameCount}
            onChange={(e) =>
              updateConfig(
                "frameCount",
                Math.max(1, parseInt(e.target.value, 10) || 1),
              )
            }
            min={1}
            disabled={isRunning}
          />
        </div>

        <div className="benchmark-checkbox-row">
          <input
            type="checkbox"
            className="benchmark-checkbox"
            id="warmup-toggle"
            checked={config.warmup}
            onChange={() => updateConfig("warmup", !config.warmup)}
            disabled={isRunning}
          />
          <label className="benchmark-checkbox-label" htmlFor="warmup-toggle">
            Warmup frames ({config.warmupFrames})
          </label>
        </div>
      </div>

      {/* ─── Capture Toggles ───────────────────────────── */}
      <div className="benchmark-section">
        <div className="benchmark-section-label">
          <FileText size={14} />
          Report Capture
        </div>
        {CAPTURE_TOGGLES.map((opt) => (
          <div key={opt.key} className="benchmark-checkbox-row">
            <input
              type="checkbox"
              className="benchmark-checkbox"
              id={`capture-${opt.key}`}
              checked={!!config.tracking[opt.key]}
              onChange={() => toggleTrackingOpt(opt.key)}
              disabled={isRunning}
            />
            <label
              className="benchmark-checkbox-label"
              htmlFor={`capture-${opt.key}`}
            >
              {opt.label}
            </label>
          </div>
        ))}
      </div>

      {/* ─── Extras ────────────────────────────────────── */}
      <div className="benchmark-section">
        <div className="benchmark-section-label">
          <Wrench size={14} />
          Extras
        </div>
        <div className="benchmark-checkbox-row">
          <input
            type="checkbox"
            className="benchmark-checkbox"
            id="extra-workers"
            checked={config.extras.workerCountsEnabled}
            onChange={() =>
              updateConfig("extras", {
                ...config.extras,
                workerCountsEnabled: !config.extras.workerCountsEnabled,
              })
            }
            disabled={isRunning}
          />
          <label className="benchmark-checkbox-label" htmlFor="extra-workers">
            Step over Web Worker counts
          </label>
        </div>
        {config.extras.workerCountsEnabled && (
          <div className="benchmark-field" style={{ marginTop: "0.25rem" }}>
            <label className="benchmark-field-label">
              Worker counts (comma-separated)
            </label>
            <input
              className="benchmark-field-input"
              value={workerCountsStr}
              onChange={(e) => setWorkerCountsStr(e.target.value)}
              onBlur={handleWorkerCountsBlur}
              disabled={isRunning}
              placeholder="1, 2, 4, 8"
            />
          </div>
        )}
      </div>

      {/* ─── Run / Stop ────────────────────────────────── */}
      {isRunning ? (
        <button className="benchmark-run-btn stop" onClick={onStop}>
          <Stop size={16} weight="bold" />
          Stop Benchmark
        </button>
      ) : (
        <button
          className="benchmark-run-btn run"
          onClick={onRun}
          disabled={!canRun || config.methods.length === 0}
        >
          <Play size={16} weight="bold" />
          Run Benchmark
        </button>
      )}

      {/* ─── Progress ──────────────────────────────────── */}
      {isRunning && progress && (
        <div className="benchmark-progress">
          <div className="benchmark-progress-bar">
            <div
              className="benchmark-progress-fill"
              style={{ width: `${progressFraction}%` }}
            />
          </div>
          <div className="benchmark-progress-text">
            <Timer
              size={10}
              weight="bold"
              style={{ display: "inline", marginRight: 4 }}
            />
            {progress.currentMethod}
            {progress.extraLabel ? ` (${progress.extraLabel})` : ""} @{" "}
            {progress.currentAgentCount.toLocaleString()} agents — frame{" "}
            {progress.currentFrame}/{progress.totalFrames} (
            {progress.completedRuns}/{progress.totalRuns} runs)
          </div>
        </div>
      )}

      {/* ─── Results ───────────────────────────────────── */}
      {isComplete && result && (
        <>
          <div className="benchmark-summary">{result.overallSummary}</div>
          <div className="benchmark-actions">
            {result.reports.map((r, i) => (
              <button
                key={i}
                className="benchmark-action-btn primary"
                onClick={() => onDownload(i)}
                title={`Download ${r.method}${r.workerCount ? ` (${r.workerCount}w)` : ""} @ ${r.agentCount}`}
              >
                <DownloadSimple size={12} weight="bold" />
                {r.method}
                {r.workerCount ? ` ${r.workerCount}w` : ""}{" "}
                {r.agentCount >= 1000
                  ? `${(r.agentCount / 1000).toFixed(0)}k`
                  : r.agentCount}
              </button>
            ))}
          </div>
        </>
      )}

      {status === "cancelled" && (
        <div
          className="benchmark-summary"
          style={{ borderColor: "rgba(255, 100, 100, 0.2)" }}
        >
          Benchmark cancelled. Results may be incomplete — restart to run again.
        </div>
      )}
    </div>
  );
};
