import { useCallback, useEffect, useRef, useState } from "react";
import {
  Play,
  Stop,
  DownloadSimple,
  Trash,
  Lightning,
  CalendarBlank,
  Clock,
  Users,
  Cpu,
} from "@phosphor-icons/react";
import { Method, type RenderMode } from "@websimbench/agentyx";
import type {
  BenchmarkConfig,
  BenchmarkProgress,
  BenchmarkResult,
  BenchmarkStatus,
} from "@/hooks/useBenchmark";
import type { BenchmarkEntry } from "@/hooks/useBenchmarkDB";
import "./BenchmarkPanel.css";
import {
  ArrowLeft,
  FileText,
  Frame,
  Image,
  PictureInPicture,
  Wrench,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ALL_METHODS: { value: Method; label: string }[] = [
  { value: "JavaScript", label: "JavaScript" },
  { value: "WebGPU", label: "WebGPU" },
  { value: "WebWorkers", label: "WebWorkers" },
  { value: "WebAssembly", label: "WebAssembly" },
];

const ALL_RENDER_MODES: { value: RenderMode; label: string }[] = [
  { value: "cpu", label: "CPU Render" },
  { value: "gpu", label: "GPU Render (WebGPU only)" },
  { value: "none", label: "Headless (none)" },
];

const CAPTURE_TOGGLES: {
  key: keyof NonNullable<BenchmarkConfig["tracking"]>;
  label: string;
}[] = [
  { key: "captureDeviceMetrics", label: "Device Metrics" },
  { key: "captureFrameInputs", label: "Frame Inputs" },
  { key: "captureRuntimeSamples", label: "Runtime Samples" },
  { key: "captureJsHeapSamples", label: "JS Heap Samples" },
  { key: "captureBatteryStatus", label: "Battery Samples" },
  { key: "captureThermalCanary", label: "Thermal Canary (event-loop drift)" },
  { key: "captureLogs", label: "Capture Logs" },
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
  onReset: () => void;
  onDownload: (index: number) => void;
  onDownloadFullReport: () => void;
  onSave: () => void;
  // Recent benchmarks
  recentEntries: BenchmarkEntry[];
  onDownloadRecent: (id: string) => void;
  onDeleteRecent: (id: string) => void;
  canRun: boolean;
  // Canvas refs for render preview
  sourceCanvasRef?: React.RefObject<HTMLCanvasElement | null>;
  gpuCanvasRef?: React.RefObject<HTMLCanvasElement | null>;
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
  onReset,
  onDownload,
  onDownloadFullReport,
  recentEntries,
  onDownloadRecent,
  onDeleteRecent,
  canRun,
  sourceCanvasRef,
  gpuCanvasRef,
}: BenchmarkPanelProps) => {
  const isRunning = status === "running";
  const isComplete = status === "complete";

  /** Format a method/renderMode pair, hiding 'none' render mode. */
  const fmtMethod = (method: string, renderMode?: string) =>
    renderMode && renderMode !== "none" ? `${method} (${renderMode})` : method;

  /** Format agent count with K suffix. */
  const fmtAgents = (n: number) =>
    n >= 1000 ? `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}K` : String(n);

  const [agentCountsStr, setAgentCountsStr] = useState(
    config.agentCounts.join(", "),
  );
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

  const toggleRenderMode = useCallback(
    (mode: RenderMode) => {
      const next = config.renderModes.includes(mode)
        ? config.renderModes.filter((m) => m !== mode)
        : [...config.renderModes, mode];
      if (next.length > 0) updateConfig("renderModes", next);
    },
    [config.renderModes, updateConfig],
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

  const progressFraction =
    progress && progress.totalRuns > 0
      ? ((progress.completedRuns + progress.currentRunProgress) /
          progress.totalRuns) *
        100
      : 0;

  // --- Render preview ---
  const previewRef = useRef<HTMLCanvasElement | null>(null);
  const isRendering =
    isRunning &&
    progress?.currentRenderMode &&
    progress.currentRenderMode !== "none";

  useEffect(() => {
    if (!isRendering) return;

    let rafId: number;
    const copyFrame = () => {
      const preview = previewRef.current;
      // Pick the right source canvas — GPU render uses gpuCanvas, CPU uses main canvas
      const src =
        progress?.currentRenderMode === "gpu"
          ? gpuCanvasRef?.current
          : sourceCanvasRef?.current;

      if (preview && src && src.width > 0 && src.height > 0) {
        const ctx = preview.getContext("2d");
        if (ctx) {
          // Match aspect ratio
          const aspect = src.width / src.height;
          preview.width = 320;
          preview.height = Math.round(320 / aspect);
          ctx.drawImage(src, 0, 0, preview.width, preview.height);
        }
      }
      rafId = requestAnimationFrame(copyFrame);
    };
    rafId = requestAnimationFrame(copyFrame);
    return () => cancelAnimationFrame(rafId);
  }, [isRendering, progress?.currentRenderMode, sourceCanvasRef, gpuCanvasRef]);

  // ---- Running / Results full-panel view ----
  if (isRunning || isComplete || status === "cancelled") {
    return (
      <div className="benchmark-panel" onClick={(e) => e.stopPropagation()}>
        <div className="benchmark-panel-title">
          <Lightning size={14} weight="fill" />
          {isRunning
            ? "Benchmark Running"
            : isComplete
              ? "Benchmark Results"
              : "Benchmark Cancelled"}
        </div>

        {/* Running state */}
        {isRunning && progress && (
          <div className="benchmark-run-view">
            <div className="benchmark-run-hero">
              <div className="benchmark-run-hero-label">
                <Lightning
                  size={18}
                  weight="fill"
                  className="benchmark-run-hero-icon"
                />
                Running Benchmark
              </div>
              <div className="benchmark-run-hero-run">
                {fmtMethod(progress.currentMethod, progress.currentRenderMode)}
                {progress.extraLabel ? ` (${progress.extraLabel})` : ""} —{" "}
                {fmtAgents(progress.currentAgentCount)} agents
              </div>
              <div className="benchmark-run-hero-detail">
                {progress.runMode === "duration"
                  ? `${Math.floor((progress.elapsedMs ?? 0) / 1000)}s / ${Math.floor((progress.targetDurationMs ?? 0) / 1000)}s`
                  : `Frame ${progress.currentFrame} / ${progress.totalFrames}`}
              </div>
            </div>

            <div className="benchmark-progress">
              <div className="benchmark-progress-bar large">
                <div
                  className="benchmark-progress-fill"
                  style={{ width: `${progressFraction}%` }}
                />
              </div>
              <div className="benchmark-progress-text">
                Run {progress.completedRuns + 1} of {progress.totalRuns} —{" "}
                {Math.round(progressFraction)}% complete
              </div>
            </div>

            {/* Render preview — shown when using CPU or GPU render mode */}
            {isRendering && (
              <div className="benchmark-preview">
                <div className="benchmark-preview-label">
                  Render Preview ({progress.currentRenderMode})
                </div>
                <canvas ref={previewRef} className="benchmark-preview-canvas" />
              </div>
            )}

            <button className="benchmark-run-btn stop" onClick={onStop}>
              <Stop size={16} weight="bold" />
              Stop Benchmark
            </button>
          </div>
        )}

        {/* Completed results */}
        {isComplete && result && (
          <div className="benchmark-run-view">
            <div className="benchmark-results-hero">
              <div className="benchmark-results-hero-count">
                {result.reports.length}
              </div>
              <div className="benchmark-results-hero-label">runs completed</div>
            </div>

            <div className="benchmark-summary">{result.overallSummary}</div>

            <div className="benchmark-actions wide">
              <button
                className="benchmark-action-btn primary full-width"
                onClick={onDownloadFullReport}
                title="Download complete suite JSON with all runs"
              >
                <DownloadSimple size={14} weight="bold" />
                Download Full Report
              </button>
              {result.reports.map((r, i) => {
                const label = fmtMethod(r.method, r.renderMode);
                const agents = fmtAgents(r.agentCount);
                const parts: string[] = [label];
                if (typeof r.workerCount === "number")
                  parts.push(`${r.workerCount}w`);
                if (r.wasmExecutionMode) parts.push(`[${r.wasmExecutionMode}]`);
                parts.push(agents);
                return (
                  <button
                    key={i}
                    className="benchmark-action-btn primary"
                    onClick={() => onDownload(i)}
                    title={`Download ${label} @ ${r.agentCount.toLocaleString()} agents`}
                  >
                    <DownloadSimple size={12} weight="bold" />
                    {parts.join(" · ")}
                  </button>
                );
              })}
            </div>

            <button
              className="benchmark-run-btn run"
              onClick={onRun}
              disabled={
                !canRun ||
                config.methods.length === 0 ||
                config.renderModes.length === 0
              }
              style={{ marginTop: "0.5rem" }}
            >
              <Play size={16} weight="bold" />
              Run Again
            </button>
          </div>
        )}

        {/* Cancelled */}
        {status === "cancelled" && (
          <div className="benchmark-run-view">
            <div
              className="benchmark-summary"
              style={{ borderColor: "rgba(255, 100, 100, 0.2)" }}
            >
              Benchmark cancelled. Results may be incomplete — restart to run
              again.
            </div>
            <button
              className="benchmark-run-btn run"
              onClick={onRun}
              disabled={
                !canRun ||
                config.methods.length === 0 ||
                config.renderModes.length === 0
              }
              style={{ marginTop: "0.5rem" }}
            >
              <Play size={16} weight="bold" />
              Run Benchmark
            </button>
          </div>
        )}

        {/* Persistent back button — always at bottom */}
        <button
          className="benchmark-back-btn persistent"
          onClick={() => {
            if (isRunning) onStop();
            onReset();
          }}
          type="button"
        >
          <ArrowLeft size={16} /> Back to Configuration
        </button>
      </div>
    );
  }

  // ---- Configuration view (idle state) ----
  return (
    <div className="benchmark-panel" onClick={(e) => e.stopPropagation()}>
      <div className="benchmark-panel-title">
        <Lightning size={14} weight="fill" />
        Benchmark Configuration
      </div>

      <p className="benchmark-panel-description">
        Run repeatable browser benchmarks and export a complete JSON suite for
        offline paper analysis.
      </p>

      <div className="benchmark-section">
        <div className="benchmark-section-label">
          <Clock size={14} weight="bold" />
          Recent Benchmarks
          <button
            className="benchmark-all-runs-link"
            onClick={() => {
              window.location.hash = "#/reports";
            }}
          >
            View All Runs →
          </button>
        </div>

        {recentEntries.length > 0 ? (
          <>
            <div className="benchmark-recent-strip">
              {recentEntries.slice(0, 4).map((entry) => {
                const d = new Date(entry.timestamp);
                const date = d.toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                });
                const time = d.toLocaleTimeString(undefined, {
                  hour: "2-digit",
                  minute: "2-digit",
                });
                const cleanMethods = entry.methods.map((m) => {
                  const [method, render] = m.split("/");
                  return fmtMethod(method, render);
                });
                const agentRange =
                  entry.agentCounts.length > 1
                    ? `${fmtAgents(Math.min(...entry.agentCounts))}–${fmtAgents(Math.max(...entry.agentCounts))}`
                    : fmtAgents(entry.agentCounts[0] ?? 0);
                return (
                  <div key={entry.id} className="benchmark-recent-card">
                    <div className="benchmark-recent-card-name">
                      {entry.label}
                    </div>
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
                    <div className="benchmark-recent-card-stats">
                      <span>{agentRange} agents</span>
                      <span className="benchmark-recent-card-sep">·</span>
                      <span>{entry.frameCount} frames</span>
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
          </>
        ) : (
          <div className="benchmark-recent-strip">
            <span className="no-recent-benchmarks">No recent benchmarks</span>
          </div>
        )}
      </div>

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

      <div className="benchmark-section">
        <div className="benchmark-section-label">
          <Image size={14} />
          Render Modes
        </div>
        {ALL_RENDER_MODES.map((mode) => (
          <div key={mode.value} className="benchmark-checkbox-row">
            <input
              type="checkbox"
              className="benchmark-checkbox"
              id={`render-${mode.value}`}
              checked={config.renderModes.includes(mode.value)}
              onChange={() => toggleRenderMode(mode.value)}
              disabled={isRunning}
            />
            <label
              className="benchmark-checkbox-label"
              htmlFor={`render-${mode.value}`}
            >
              {mode.label}
            </label>
          </div>
        ))}
      </div>

      <div className="benchmark-section">
        <div className="benchmark-section-label">
          <Frame size={14} />
          Run Length
        </div>
        <div className="benchmark-field">
          <label className="benchmark-field-label">Run mode</label>
          <select
            className="benchmark-field-input"
            value={config.runMode}
            onChange={(e) =>
              updateConfig(
                "runMode",
                e.target.value === "duration" ? "duration" : "frames",
              )
            }
            disabled={isRunning}
          >
            <option value="frames">Fixed frames</option>
            <option value="duration">Fixed duration</option>
          </select>
        </div>

        {config.runMode === "frames" ? (
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
        ) : (
          <div className="benchmark-field">
            <label className="benchmark-field-label">Duration (seconds)</label>
            <input
              type="number"
              className="benchmark-field-input"
              value={config.durationSeconds}
              onChange={(e) =>
                updateConfig(
                  "durationSeconds",
                  Math.max(1, parseInt(e.target.value, 10) || 1),
                )
              }
              min={1}
              disabled={isRunning}
            />
          </div>
        )}

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
            Warmup pass
          </label>
        </div>

        {config.warmup && (
          <div className="benchmark-field" style={{ marginTop: "0.25rem" }}>
            <label className="benchmark-field-label">Warmup frames</label>
            <input
              type="number"
              className="benchmark-field-input"
              value={config.warmupFrames}
              onChange={(e) =>
                updateConfig(
                  "warmupFrames",
                  Math.max(1, parseInt(e.target.value, 10) || 1),
                )
              }
              min={1}
              disabled={isRunning}
            />
          </div>
        )}
      </div>

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

        <div className="benchmark-checkbox-row" style={{ marginTop: "0.4rem" }}>
          <input
            type="checkbox"
            className="benchmark-checkbox"
            id="extra-wasm-simd"
            checked={config.extras.wasmSimdSweepEnabled}
            onChange={() =>
              updateConfig("extras", {
                ...config.extras,
                wasmSimdSweepEnabled: !config.extras.wasmSimdSweepEnabled,
              })
            }
            disabled={isRunning}
          />
          <label className="benchmark-checkbox-label" htmlFor="extra-wasm-simd">
            Sweep WASM scalar vs SIMD execution
          </label>
        </div>

        <div className="benchmark-field" style={{ marginTop: "0.4rem" }}>
          <label className="benchmark-field-label">
            WASM execution mode (default)
          </label>
          <select
            className="benchmark-field-input"
            value={config.extras.wasmExecutionMode}
            onChange={(e) =>
              updateConfig("extras", {
                ...config.extras,
                wasmExecutionMode:
                  e.target.value === "scalar"
                    ? "scalar"
                    : e.target.value === "simd"
                      ? "simd"
                      : "auto",
              })
            }
            disabled={isRunning}
          >
            <option value="auto">Auto (prefer SIMD)</option>
            <option value="scalar">Scalar</option>
            <option value="simd">SIMD</option>
          </select>
        </div>

        <div className="benchmark-field" style={{ marginTop: "0.4rem" }}>
          <label className="benchmark-field-label">
            Runtime sample interval (ms)
          </label>
          <input
            type="number"
            className="benchmark-field-input"
            value={config.extras.runtimeSampleIntervalMs}
            onChange={(e) =>
              updateConfig("extras", {
                ...config.extras,
                runtimeSampleIntervalMs: Math.max(
                  100,
                  parseInt(e.target.value, 10) || 100,
                ),
              })
            }
            min={100}
            step={100}
            disabled={isRunning}
          />
        </div>
      </div>

      <div className="benchmark-section">
        <div className="benchmark-section-label">
          <FileText size={14} />
          Metadata
        </div>
        <div className="benchmark-field">
          <label className="benchmark-field-label">Label (optional)</label>
          <input
            className="benchmark-field-input"
            value={config.metadata.label}
            onChange={(e) =>
              updateConfig("metadata", {
                ...config.metadata,
                label: e.target.value,
              })
            }
            disabled={isRunning}
            placeholder="e.g. baseline-run, paper-v2"
          />
        </div>
      </div>

      <button
        className="benchmark-run-btn run"
        onClick={onRun}
        disabled={
          !canRun ||
          config.methods.length === 0 ||
          config.renderModes.length === 0
        }
      >
        <Play size={16} weight="bold" />
        Run Benchmark
      </button>
    </div>
  );
};
