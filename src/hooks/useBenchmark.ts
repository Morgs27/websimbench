import { useState, useRef, useCallback } from "react";
import { Method, Simulation, type TrackingOptions } from "@websimbench/agentyx";
import type { BenchmarkEntry } from "./useBenchmarkDB";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BenchmarkConfig {
  /** Agent counts to test, e.g. [1000, 5000, 10000] */
  agentCounts: number[];
  /** Compute methods to benchmark */
  methods: Method[];
  /** Number of simulation frames per run */
  frameCount: number;
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
  };
}

export type BenchmarkStatus = "idle" | "running" | "complete" | "cancelled";

export interface BenchmarkProgress {
  currentMethod: string;
  currentAgentCount: number;
  currentFrame: number;
  totalFrames: number;
  /** Total runs already completed */
  completedRuns: number;
  totalRuns: number;
  /** Label for extra dimension being tested (e.g. "4 workers") */
  extraLabel?: string;
}

export interface BenchmarkResult {
  reports: Array<{
    method: string;
    agentCount: number;
    workerCount?: number;
    summary: Record<string, unknown>;
    reportBlob: Blob;
  }>;
  overallSummary: string;
}

export const DEFAULT_BENCHMARK_CONFIG: BenchmarkConfig = {
  agentCounts: [1000, 5000, 10000],
  methods: ["JavaScript", "WebGPU"],
  frameCount: 50,
  warmup: true,
  warmupFrames: 5,
  tracking: {
    enabled: true,
    captureAgentStates: false,
    captureFrameInputs: false,
    captureLogs: true,
    captureDeviceMetrics: true,
    captureRawArrays: false,
  },
  extras: {
    workerCountsEnabled: false,
    workerCounts: [1, 2, 4, 8],
  },
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
    ): Promise<BenchmarkResult | null> => {
      canvasRef.current = canvas;
      const controller = new AbortController();
      abortRef.current = controller;

      setStatus("running");
      setResult(null);

      const allReports: BenchmarkResult["reports"] = [];

      // Build run matrix:
      // For each method × agentCount, and if WebWorkers + stepping enabled,
      // also iterate over worker counts.
      const runs: Array<{
        method: Method;
        agentCount: number;
        workerCount?: number;
      }> = [];

      for (const method of cfg.methods) {
        for (const agentCount of cfg.agentCounts) {
          if (
            method === "WebWorkers" &&
            cfg.extras.workerCountsEnabled &&
            cfg.extras.workerCounts.length > 0
          ) {
            for (const wc of cfg.extras.workerCounts) {
              runs.push({ method, agentCount, workerCount: wc });
            }
          } else {
            runs.push({ method, agentCount });
          }
        }
      }

      let completedRuns = 0;

      for (const run of runs) {
        if (controller.signal.aborted) break;

        const extraLabel = run.workerCount
          ? `${run.workerCount} worker${run.workerCount > 1 ? "s" : ""}`
          : undefined;

        setProgress({
          currentMethod: run.method,
          currentAgentCount: run.agentCount,
          currentFrame: 0,
          totalFrames: cfg.frameCount + (cfg.warmup ? cfg.warmupFrames : 0),
          completedRuns,
          totalRuns: runs.length,
          extraLabel,
        });

        const simOptions: { agents: number; workers?: number } = {
          agents: run.agentCount,
        };
        if (run.workerCount !== undefined) {
          simOptions.workers = run.workerCount;
        }

        let sim: Simulation | null = null;
        try {
          sim = new Simulation({
            canvas,
            agentScript: code,
            options: simOptions,
            tracking: cfg.tracking as TrackingOptions,
          });

          // Init GPU if needed
          if (run.method === "WebGPU") {
            await sim.initGPU();
          }

          // Warmup frames (discarded)
          if (cfg.warmup) {
            for (let i = 0; i < cfg.warmupFrames; i++) {
              if (controller.signal.aborted) break;
              await sim.runFrame(run.method, {}, "none");
              setProgress((p) => (p ? { ...p, currentFrame: i + 1 } : p));
            }
          }

          if (controller.signal.aborted) {
            sim.destroy();
            break;
          }

          // Destroy warmup sim and create fresh one for actual benchmark
          sim.destroy();
          sim = new Simulation({
            canvas,
            agentScript: code,
            options: simOptions,
            tracking: cfg.tracking as TrackingOptions,
          });

          if (run.method === "WebGPU") {
            await sim.initGPU();
          }

          // Run benchmark frames
          const warmupOffset = cfg.warmup ? cfg.warmupFrames : 0;
          for (let i = 0; i < cfg.frameCount; i++) {
            if (controller.signal.aborted) break;
            await sim.runFrame(run.method, {}, "none");
            setProgress((p) =>
              p ? { ...p, currentFrame: warmupOffset + i + 1 } : p,
            );
          }

          if (controller.signal.aborted) {
            sim.destroy();
            break;
          }

          // Collect report
          const report = sim.getTrackingReport();
          const blob = sim.exportTrackingReportBlob();

          allReports.push({
            method: run.method,
            agentCount: run.agentCount,
            workerCount: run.workerCount,
            summary: report.summary as unknown as Record<string, unknown>,
            reportBlob: blob,
          });

          sim.destroy();
          completedRuns += 1;
        } catch (err) {
          console.error(
            `Benchmark error for ${run.method} @ ${run.agentCount}:`,
            err,
          );
          sim?.destroy();
          completedRuns += 1;
        }
      }

      if (controller.signal.aborted) {
        setStatus("cancelled");
        setProgress(null);
        return null;
      }

      // Build overall summary string
      const summaryLines: string[] = [
        `Benchmark complete — ${allReports.length} runs`,
        "",
      ];
      for (const r of allReports) {
        const s = r.summary as any;
        const workerSuffix = r.workerCount ? ` (${r.workerCount}w)` : "";
        summaryLines.push(
          `${r.method}${workerSuffix} @ ${r.agentCount.toLocaleString()} agents — ` +
            `avg ${s.averageExecutionMs?.toFixed(2) ?? "N/A"}ms/frame ` +
            `(${s.frameCount} frames)`,
        );
      }

      const benchResult: BenchmarkResult = {
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

  /** Build an IndexedDB entry from the current result. */
  const buildEntry = useCallback(
    (r: BenchmarkResult): { entry: BenchmarkEntry; combinedBlob: Blob } => {
      const id = crypto.randomUUID?.() ?? `bench-${Date.now()}`;
      const combinedBlob = new Blob(
        r.reports.map((rp) => rp.reportBlob),
        { type: "application/json" },
      );
      return {
        entry: {
          id,
          timestamp: Date.now(),
          label: `Benchmark ${new Date().toLocaleString()}`,
          agentCounts: r.reports.map((rp) => rp.agentCount),
          methods: [...new Set(r.reports.map((rp) => rp.method))],
          frameCount: (r.reports[0]?.summary as any)?.frameCount ?? 0,
          summary: r.reports[0]?.summary ?? {},
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
    buildEntry,
  };
}
