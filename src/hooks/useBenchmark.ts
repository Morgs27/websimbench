import { useState, useRef, useCallback } from "react";
import {
  Method,
  Simulation,
  type RenderMode,
  type SimulationTrackingReport,
  type TrackingOptions,
  type WasmExecutionMode,
} from "@websimbench/agentyx";
import type { BenchmarkEntry } from "./useBenchmarkDB";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BenchmarkRunMode = "frames" | "duration";

export interface BenchmarkConfig {
  /** Agent counts to test, e.g. [1000, 5000, 10000] */
  agentCounts: number[];
  /** Compute methods to benchmark */
  methods: Method[];
  /** Render modes to benchmark */
  renderModes: RenderMode[];
  /** Frame-count or duration-based execution */
  runMode: BenchmarkRunMode;
  /** Number of simulation frames per run (when runMode='frames') */
  frameCount: number;
  /** Duration per run in seconds (when runMode='duration') */
  durationSeconds: number;
  /** Run warmup frames first (discarded from report) */
  warmup: boolean;
  /** Number of warmup frames */
  warmupFrames: number;
  /** Tracking capture toggles */
  tracking: Partial<TrackingOptions>;
  /** Extras */
  extras: {
    /** Enable stepping over multiple web worker counts */
    workerCountsEnabled: boolean;
    /** Worker counts to benchmark (only applies to WebWorkers method) */
    workerCounts: number[];
    /** Run WebAssembly with scalar + SIMD execution variants */
    wasmSimdSweepEnabled: boolean;
    /** Default WASM execution mode when sweep is disabled */
    wasmExecutionMode: WasmExecutionMode;
  };
}

export type BenchmarkStatus = "idle" | "running" | "complete" | "cancelled";

export interface BenchmarkProgress {
  currentMethod: string;
  currentRenderMode: RenderMode;
  currentAgentCount: number;
  currentFrame: number;
  totalFrames: number;
  /** Total runs already completed */
  completedRuns: number;
  totalRuns: number;
  /** 0..1 progress for current run */
  currentRunProgress: number;
  /** Label for extra dimensions being tested */
  extraLabel?: string;
  /** Current run mode for display */
  runMode: BenchmarkRunMode;
  /** Elapsed time for duration mode */
  elapsedMs?: number;
  /** Target duration for duration mode */
  targetDurationMs?: number;
}

export interface BenchmarkRunReport {
  status: "completed" | "failed";
  method: Method;
  renderMode: RenderMode;
  agentCount: number;
  workerCount?: number;
  wasmExecutionMode?: WasmExecutionMode;
  executedFrames: number;
  summary: Record<string, unknown>;
  error?: string;
  report: SimulationTrackingReport;
  reportBlob: Blob;
}

export interface BenchmarkResult {
  simulationName: string;
  sourceCode: string;
  configSnapshot: BenchmarkConfig;
  generatedAt: number;
  reports: BenchmarkRunReport[];
  overallSummary: string;
}

export type BenchmarkSuiteExport = {
  schemaVersion: "websimbench.benchmark.v1";
  simulationName: string;
  generatedAt: string;
  sourceCode: string;
  config: BenchmarkConfig;
  runCount: number;
  runs: Array<{
    status: "completed" | "failed";
    method: Method;
    renderMode: RenderMode;
    agentCount: number;
    workerCount?: number;
    wasmExecutionMode?: WasmExecutionMode;
    executedFrames: number;
    summary: Record<string, unknown>;
    error?: string;
    trackingReport: SimulationTrackingReport;
  }>;
};

export const DEFAULT_BENCHMARK_CONFIG: BenchmarkConfig = {
  agentCounts: [1000, 5000, 10000],
  methods: ["JavaScript", "WebGPU"],
  renderModes: ["cpu", "gpu"],
  runMode: "frames",
  frameCount: 50,
  durationSeconds: 10,
  warmup: true,
  warmupFrames: 2,
  tracking: {
    enabled: true,
    captureAgentStates: false,
    captureFrameInputs: true,
    captureLogs: false,
    captureDeviceMetrics: true,
    captureRawArrays: false,
    captureRuntimeSamples: true,
    captureJsHeapSamples: true,
    captureBatteryStatus: true,
    captureThermalCanary: true,
    runtimeSampleIntervalMs: 1000,
  },
  extras: {
    workerCountsEnabled: false,
    workerCounts: [1, 2, 4, 8],
    wasmSimdSweepEnabled: false,
    wasmExecutionMode: "auto",
  },
};

const nextAnimationFrame = (): Promise<void> => {
  if (
    typeof window !== "undefined" &&
    typeof window.requestAnimationFrame === "function"
  ) {
    return new Promise((resolve) => {
      window.requestAnimationFrame(() => resolve());
    });
  }

  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
};

const canUseRenderMode = (method: Method, renderMode: RenderMode): boolean => {
  if (renderMode === "gpu") return method === "WebGPU";
  return true;
};

const buildTrackingOptions = (cfg: BenchmarkConfig): TrackingOptions => {
  const sampleInterval = Math.max(
    100,
    Math.round(cfg.tracking.runtimeSampleIntervalMs || 1000),
  );
  return {
    enabled: cfg.tracking.enabled ?? true,
    captureAgentStates: cfg.tracking.captureAgentStates ?? false,
    captureFrameInputs: cfg.tracking.captureFrameInputs ?? false,
    captureLogs: cfg.tracking.captureLogs ?? true,
    captureDeviceMetrics: cfg.tracking.captureDeviceMetrics ?? true,
    captureRawArrays: cfg.tracking.captureRawArrays ?? false,
    captureRuntimeSamples: cfg.tracking.captureRuntimeSamples ?? false,
    captureJsHeapSamples: cfg.tracking.captureJsHeapSamples ?? true,
    captureBatteryStatus: cfg.tracking.captureBatteryStatus ?? false,
    captureThermalCanary: cfg.tracking.captureThermalCanary ?? false,
    runtimeSampleIntervalMs: sampleInterval,
  };
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useBenchmark() {
  const [isBenchmarkMode, setIsBenchmarkMode] = useState(false);
  const [config, setConfig] = useState<BenchmarkConfig>(
    DEFAULT_BENCHMARK_CONFIG,
  );
  const [status, setStatus] = useState<BenchmarkStatus>("idle");
  const [progress, setProgress] = useState<BenchmarkProgress | null>(null);
  const [result, setResult] = useState<BenchmarkResult | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const updateConfig = useCallback(
    <K extends keyof BenchmarkConfig>(key: K, value: BenchmarkConfig[K]) => {
      setConfig((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const runBenchmark = useCallback(
    async (
      code: string,
      cfg: BenchmarkConfig,
      canvas: HTMLCanvasElement,
      gpuCanvas?: HTMLCanvasElement,
      simulationName: string = "Untitled Sim",
    ): Promise<BenchmarkResult | null> => {
      canvasRef.current = canvas;
      const controller = new AbortController();
      abortRef.current = controller;

      setStatus("running");
      setResult(null);

      const trackingOptions = buildTrackingOptions(cfg);
      const allReports: BenchmarkResult["reports"] = [];

      const runs: Array<{
        method: Method;
        renderMode: RenderMode;
        agentCount: number;
        workerCount?: number;
        wasmExecutionMode?: WasmExecutionMode;
      }> = [];

      for (const method of cfg.methods) {
        for (const renderMode of cfg.renderModes) {
          if (!canUseRenderMode(method, renderMode)) {
            continue;
          }

          for (const agentCount of cfg.agentCounts) {
            const workerVariants =
              method === "WebWorkers" &&
              cfg.extras.workerCountsEnabled &&
              cfg.extras.workerCounts.length > 0
                ? cfg.extras.workerCounts
                : [undefined];

            const wasmVariants =
              method === "WebAssembly" && cfg.extras.wasmSimdSweepEnabled
                ? (["scalar", "simd"] as WasmExecutionMode[])
                : ([cfg.extras.wasmExecutionMode] as WasmExecutionMode[]);

            for (const workerCount of workerVariants) {
              for (const wasmExecutionMode of wasmVariants) {
                runs.push({
                  method,
                  renderMode,
                  agentCount,
                  workerCount,
                  wasmExecutionMode:
                    method === "WebAssembly" ? wasmExecutionMode : undefined,
                });
              }
            }
          }
        }
      }

      let completedRuns = 0;

      for (const run of runs) {
        if (controller.signal.aborted) break;

        const labelParts: string[] = [];
        if (typeof run.workerCount === "number") {
          labelParts.push(
            `${run.workerCount} worker${run.workerCount > 1 ? "s" : ""}`,
          );
        }
        if (run.wasmExecutionMode) {
          labelParts.push(`WASM ${run.wasmExecutionMode}`);
        }

        const estimatedMeasuredFrames =
          cfg.runMode === "frames"
            ? cfg.frameCount
            : Math.max(1, Math.round(cfg.durationSeconds * 60));

        setProgress({
          currentMethod: run.method,
          currentRenderMode: run.renderMode,
          currentAgentCount: run.agentCount,
          currentFrame: 0,
          totalFrames:
            estimatedMeasuredFrames + (cfg.warmup ? cfg.warmupFrames : 0),
          completedRuns,
          totalRuns: runs.length,
          currentRunProgress: 0,
          extraLabel:
            labelParts.length > 0 ? labelParts.join(" • ") : undefined,
          runMode: cfg.runMode,
          elapsedMs: cfg.runMode === "duration" ? 0 : undefined,
          targetDurationMs:
            cfg.runMode === "duration"
              ? Math.max(1, cfg.durationSeconds) * 1000
              : undefined,
        });

        const simOptions: {
          agents: number;
          workers?: number;
          wasmExecutionMode?: WasmExecutionMode;
        } = {
          agents: run.agentCount,
        };
        if (typeof run.workerCount === "number") {
          simOptions.workers = run.workerCount;
        }
        if (run.method === "WebAssembly" && run.wasmExecutionMode) {
          simOptions.wasmExecutionMode = run.wasmExecutionMode;
        }

        let sim: Simulation | null = null;
        let executedFrames = 0;
        try {
          const runMetadata: Record<string, unknown> = {
            simulationName,
            benchmark: {
              method: run.method,
              renderMode: run.renderMode,
              agentCount: run.agentCount,
              workerCount: run.workerCount,
              wasmExecutionMode: run.wasmExecutionMode,
              runMode: cfg.runMode,
              requestedFrameCount: cfg.frameCount,
              requestedDurationSeconds: cfg.durationSeconds,
              warmupFrames: cfg.warmup ? cfg.warmupFrames : 0,
              runtimeSampleIntervalMs: trackingOptions.runtimeSampleIntervalMs,
            },
          };

          sim = new Simulation({
            canvas,
            gpuCanvas: gpuCanvas ?? null,
            agentScript: code,
            options: simOptions,
            tracking: trackingOptions,
            metadata: runMetadata,
          });

          // Init GPU when needed by compute or render mode.
          if (run.method === "WebGPU" || run.renderMode === "gpu") {
            await sim.initGPU();
          }

          // Warmup frames (discarded).
          if (cfg.warmup) {
            const warmupWeight = 0.1;
            for (let i = 0; i < cfg.warmupFrames; i++) {
              if (controller.signal.aborted) break;
              await sim.runFrame(run.method, {}, run.renderMode);

              setProgress((p) => {
                if (!p) return p;
                const progressValue =
                  cfg.warmupFrames > 0
                    ? ((i + 1) / cfg.warmupFrames) * warmupWeight
                    : warmupWeight;
                return {
                  ...p,
                  currentFrame: i + 1,
                  currentRunProgress: progressValue,
                };
              });

              // Yield to let React flush progress updates.
              await nextAnimationFrame();
            }
          }

          if (controller.signal.aborted) {
            sim.destroy();
            break;
          }

          // Destroy warmup sim and create fresh one for actual benchmark.
          sim.destroy();
          sim = new Simulation({
            canvas,
            gpuCanvas: gpuCanvas ?? null,
            agentScript: code,
            options: simOptions,
            tracking: trackingOptions,
            metadata: {
              simulationName,
              benchmark: {
                method: run.method,
                renderMode: run.renderMode,
                agentCount: run.agentCount,
                workerCount: run.workerCount,
                wasmExecutionMode: run.wasmExecutionMode,
                runMode: cfg.runMode,
                requestedFrameCount: cfg.frameCount,
                requestedDurationSeconds: cfg.durationSeconds,
                warmupFrames: cfg.warmup ? cfg.warmupFrames : 0,
                runtimeSampleIntervalMs:
                  trackingOptions.runtimeSampleIntervalMs,
              },
            },
          });

          if (run.method === "WebGPU" || run.renderMode === "gpu") {
            await sim.initGPU();
          }

          // Run benchmark frames.
          const warmupOffset = cfg.warmup ? cfg.warmupFrames : 0;
          const warmupWeight = cfg.warmup ? 0.1 : 0;
          const progressUpdateIntervalMs = 50;
          let lastProgressUpdateAt = performance.now();

          if (cfg.runMode === "frames") {
            for (let i = 0; i < cfg.frameCount; i++) {
              if (controller.signal.aborted) break;
              await sim.runFrame(run.method, {}, run.renderMode);
              executedFrames = i + 1;

              const now = performance.now();
              const shouldUpdateProgress =
                i + 1 === cfg.frameCount ||
                now - lastProgressUpdateAt >= progressUpdateIntervalMs;

              if (shouldUpdateProgress) {
                lastProgressUpdateAt = now;
                setProgress((p) => {
                  if (!p) return p;
                  const measuredProgress =
                    cfg.frameCount > 0 ? (i + 1) / cfg.frameCount : 1;
                  return {
                    ...p,
                    currentFrame: warmupOffset + i + 1,
                    currentRunProgress:
                      warmupWeight + measuredProgress * (1 - warmupWeight),
                  };
                });
              }

              // Always yield so the browser can repaint, the render preview
              // rAF loop can copy frames, and React can flush state updates.
              await nextAnimationFrame();
            }
          } else {
            const targetDurationMs = Math.max(1, cfg.durationSeconds) * 1000;
            const runStart = performance.now();

            while (performance.now() - runStart < targetDurationMs) {
              if (controller.signal.aborted) break;
              await sim.runFrame(run.method, {}, run.renderMode);
              executedFrames += 1;

              const now = performance.now();
              const elapsedMs = now - runStart;
              const measuredProgress = Math.min(
                1,
                elapsedMs / targetDurationMs,
              );
              const shouldUpdateProgress =
                measuredProgress >= 1 ||
                now - lastProgressUpdateAt >= progressUpdateIntervalMs;

              if (shouldUpdateProgress) {
                lastProgressUpdateAt = now;
                setProgress((p) => {
                  if (!p) return p;
                  return {
                    ...p,
                    currentFrame: warmupOffset + executedFrames,
                    currentRunProgress:
                      warmupWeight + measuredProgress * (1 - warmupWeight),
                    elapsedMs,
                    targetDurationMs,
                  };
                });
              }

              if (elapsedMs >= targetDurationMs) {
                break;
              }

              // Keep duration mode cooperative with the browser event loop.
              // This prevents long tight loops from starving UI/input and
              // avoids generating an unbounded number of captured frames.
              await nextAnimationFrame();
            }
          }

          if (controller.signal.aborted) {
            sim.destroy();
            break;
          }

          // Collect report.
          await sim.finalizeTracking();
          const report = sim.getTrackingReport();
          const reportBlob = new Blob([JSON.stringify(report, null, 2)], {
            type: "application/json",
          });

          allReports.push({
            status: "completed",
            method: run.method,
            renderMode: run.renderMode,
            agentCount: run.agentCount,
            workerCount: run.workerCount,
            wasmExecutionMode: run.wasmExecutionMode,
            executedFrames,
            summary: report.summary as unknown as Record<string, unknown>,
            report,
            reportBlob,
          });

          sim.destroy();
          completedRuns += 1;
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : String(err);
          const errorStack = err instanceof Error ? err.stack : undefined;
          const errorTimestamp = Date.now();
          console.error(
            `Benchmark error for ${run.method}/${run.renderMode} @ ${run.agentCount}:`,
            err,
          );
          if (sim) {
            try {
              await sim.finalizeTracking();
            } catch (finalizeError) {
              console.warn("Failed to finalize tracking for failed run:", {
                finalizeError,
              });
            }
          }
          let failedReport: SimulationTrackingReport | undefined;
          try {
            failedReport = sim?.getTrackingReport();
          } catch (reportError) {
            console.warn("Failed to retrieve tracking report for failed run:", {
              reportError,
            });
          }

          const enrichedFailedReport = failedReport
            ? (() => {
                const hasMatchingError = failedReport.errors.some(
                  (entry) => entry.message === errorMessage,
                );
                const nextErrors = hasMatchingError
                  ? failedReport.errors
                  : [
                      ...failedReport.errors,
                      {
                        timestamp: errorTimestamp,
                        message: errorMessage,
                        stack: errorStack,
                      },
                    ];

                return {
                  ...failedReport,
                  errors: nextErrors,
                  summary: {
                    ...failedReport.summary,
                    errorCount: Math.max(
                      failedReport.summary.errorCount,
                      nextErrors.length,
                    ),
                  },
                };
              })()
            : undefined;

          const fallbackReport: SimulationTrackingReport =
            enrichedFailedReport ??
            ({
              run: {
                runId: `failed-${Date.now()}`,
                startedAt: Date.now(),
                endedAt: Date.now(),
                source: { kind: "dsl", code },
                configuration: {
                  options: simOptions,
                  requiredInputs: [],
                  definedInputs: [],
                },
                metadata: {
                  benchmark: run,
                },
              },
              frames: [],
              runtimeSamples: [],
              logs: [],
              errors: [
                {
                  timestamp: errorTimestamp,
                  message: errorMessage,
                  stack: errorStack,
                },
              ],
              summary: {
                frameCount: 0,
                durationMs: 0,
                totalExecutionMs: 0,
                averageExecutionMs: 0,
                errorCount: 1,
                methodSummaries: [],
                methodRenderSummaries: [],
                frameTimeStats: {
                  min: 0,
                  max: 0,
                  average: 0,
                  stdDev: 0,
                  p50: 0,
                  p95: 0,
                  p99: 0,
                },
                inputStats: {
                  requiredInputCount: 0,
                  definedInputCount: 0,
                  minKeysPerFrame: 0,
                  maxKeysPerFrame: 0,
                  averageKeysPerFrame: 0,
                },
                agentStats: {
                  minAgentsPerFrame: 0,
                  maxAgentsPerFrame: 0,
                  averageAgentsPerFrame: 0,
                },
              },
            } as SimulationTrackingReport);

          const reportBlob = new Blob(
            [JSON.stringify(fallbackReport, null, 2)],
            { type: "application/json" },
          );
          allReports.push({
            status: "failed",
            method: run.method,
            renderMode: run.renderMode,
            agentCount: run.agentCount,
            workerCount: run.workerCount,
            wasmExecutionMode: run.wasmExecutionMode,
            executedFrames,
            summary: fallbackReport.summary as unknown as Record<
              string,
              unknown
            >,
            error: errorMessage,
            report: fallbackReport,
            reportBlob,
          });
          sim?.destroy();
          completedRuns += 1;
        }
      }

      if (controller.signal.aborted) {
        setStatus("cancelled");
        setProgress(null);
        return null;
      }

      // Build overall summary string.
      const summaryLines: string[] = [
        `${simulationName} — Benchmark complete — ${allReports.length} runs`,
        "",
      ];
      for (const r of allReports) {
        const s = r.summary as {
          averageExecutionMs?: number;
          frameCount?: number;
        };
        const methodLabel =
          r.renderMode && r.renderMode !== "none"
            ? `${r.method} (${r.renderMode})`
            : r.method;
        const workerSuffix =
          typeof r.workerCount === "number" ? ` (${r.workerCount}w)` : "";
        const wasmSuffix =
          typeof r.wasmExecutionMode === "string"
            ? ` [${r.wasmExecutionMode}]`
            : "";
        summaryLines.push(
          `${methodLabel}${workerSuffix}${wasmSuffix} @ ${r.agentCount.toLocaleString()} agents — ` +
            `${r.status === "failed" ? `FAILED (${r.error ?? "unknown error"})` : `avg ${s.averageExecutionMs?.toFixed(2) ?? "N/A"}ms/frame (${s.frameCount ?? r.executedFrames} frames)`}`,
        );
      }

      const benchResult: BenchmarkResult = {
        simulationName,
        sourceCode: code,
        configSnapshot: cfg,
        generatedAt: Date.now(),
        reports: allReports,
        overallSummary: summaryLines.join("\n"),
      };

      setResult(benchResult);
      setStatus("complete");
      setProgress(null);

      return benchResult;
    },
    [],
  );

  const stopBenchmark = useCallback(() => {
    abortRef.current?.abort();
    setStatus("cancelled");
  }, []);

  const resetBenchmark = useCallback(() => {
    setStatus("idle");
    setResult(null);
    setProgress(null);
  }, []);

  /** Build an IndexedDB entry + valid suite JSON from the current result. */
  const buildEntry = useCallback(
    (r: BenchmarkResult): { entry: BenchmarkEntry; combinedBlob: Blob } => {
      const id = crypto.randomUUID?.() ?? `bench-${Date.now()}`;

      const suiteExport: BenchmarkSuiteExport = {
        schemaVersion: "websimbench.benchmark.v1",
        simulationName: r.simulationName,
        generatedAt: new Date().toISOString(),
        sourceCode: r.sourceCode,
        config: r.configSnapshot,
        runCount: r.reports.length,
        runs: r.reports.map((run) => ({
          status: run.status,
          method: run.method,
          renderMode: run.renderMode,
          agentCount: run.agentCount,
          workerCount: run.workerCount,
          wasmExecutionMode: run.wasmExecutionMode,
          executedFrames: run.executedFrames,
          summary: run.summary,
          error: run.error,
          trackingReport: run.report,
        })),
      };

      const combinedBlob = new Blob([JSON.stringify(suiteExport, null, 2)], {
        type: "application/json",
      });

      return {
        entry: {
          id,
          timestamp: Date.now(),
          label: r.simulationName || "Untitled Sim",
          agentCounts: [...new Set(r.reports.map((rp) => rp.agentCount))],
          methods: [
            ...new Set(
              r.reports.map((rp) =>
                rp.renderMode && rp.renderMode !== "none"
                  ? `${rp.method}/${rp.renderMode}`
                  : rp.method,
              ),
            ),
          ],
          frameCount:
            r.configSnapshot.runMode === "frames"
              ? r.configSnapshot.frameCount
              : ((r.reports[0]?.summary as { frameCount?: number } | undefined)
                  ?.frameCount ?? 0),
          summary: {
            runCount: r.reports.length,
            runMode: r.configSnapshot.runMode,
            generatedAt: r.generatedAt,
            firstRunSummary: r.reports[0]?.summary ?? {},
          },
        },
        combinedBlob,
      };
    },
    [],
  );

  return {
    isBenchmarkMode,
    setIsBenchmarkMode,
    config,
    setConfig,
    updateConfig,
    status,
    progress,
    result,
    runBenchmark,
    stopBenchmark,
    resetBenchmark,
    buildEntry,
  };
}
