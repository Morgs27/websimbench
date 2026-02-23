/**
 * @module tracking
 * Simulation run tracking and telemetry.
 *
 * The {@link SimulationTracker} records per-frame agent states, input snapshots,
 * performance metrics, log entries, and errors throughout a simulation run. The
 * captured data is assembled into a {@link SimulationTrackingReport} that can be
 * exported as JSON for offline analysis and benchmarking.
 */

import type { FramePerformance } from "./performance";
import {
  collectRuntimeMetrics,
  type RuntimeMetrics,
} from "./helpers/deviceInfo";
import Logger, { LogLevel } from "./helpers/logger";
import type {
  Agent,
  CompilationResult,
  InputValues,
  Method,
  RenderMode,
  SimulationOptions,
  SimulationSource,
  TrackingOptions,
} from "./types";

/**
 * A single log message captured from the {@link Logger} system.
 *
 * @property timestamp - Unix timestamp in milliseconds.
 * @property level - Severity level of the log entry.
 * @property context - Logger context name (e.g. `'Compiler'`, `'WebGPUCompute'`).
 * @property message - The fully formatted log message.
 */
export type SimulationLogEntry = {
  timestamp: number;
  level: "verbose" | "info" | "warning" | "error";
  context: string;
  message: string;
};

/**
 * An error captured during a simulation frame.
 *
 * @property timestamp - Unix timestamp in milliseconds.
 * @property message - Error message string.
 * @property stack - Optional stack trace.
 */
export type SimulationErrorEntry = {
  timestamp: number;
  message: string;
  stack?: string;
};

/**
 * Data recorded for a single simulation frame.
 *
 * @property frameNumber - Zero-based frame index.
 * @property timestamp - Unix timestamp when the frame was recorded.
 * @property method - Compute method used for this frame.
 * @property renderMode - Rendering strategy used for this frame.
 * @property agentPositions - Cloned agent snapshot (if agent state capture is enabled).
 * @property inputSnapshot - Serialisable copy of frame inputs (if input capture is enabled).
 * @property performance - Per-frame performance metrics.
 */
export type SimulationFrameRecord = {
  frameNumber: number;
  timestamp: number;
  method: Method;
  renderMode: RenderMode;
  agentPositions?: Agent[];
  inputSnapshot?: Record<string, unknown>;
  performance?: FramePerformance;
};

/**
 * Per-method aggregate timing breakdown.
 *
 * @property method - Compute method name.
 * @property frameCount - Number of frames executed with this method.
 * @property avgSetupTime - Mean setup/buffer time (ms).
 * @property avgComputeTime - Mean compute kernel time (ms).
 * @property avgRenderTime - Mean render time (ms).
 * @property avgReadbackTime - Mean GPU/WASM readback time (ms).
 * @property avgTotalTime - Mean total frame time (ms).
 */
export type MethodSummary = {
  method: string;
  frameCount: number;
  avgSetupTime: number;
  avgComputeTime: number;
  avgRenderTime: number;
  avgReadbackTime: number;
  avgTotalTime: number;
};

/**
 * Aggregate statistics for a simulation run.
 *
 * @property frameCount - Total number of frames in the report.
 * @property durationMs - Wall-clock duration of the run in milliseconds.
 * @property totalExecutionMs - Sum of all frame execution times.
 * @property averageExecutionMs - Mean execution time per frame.
 * @property errorCount - Number of errors recorded during the run.
 * @property methodSummaries - Per-method timing breakdowns.
 */
export type SimulationRunSummary = {
  frameCount: number;
  durationMs: number;
  totalExecutionMs: number;
  averageExecutionMs: number;
  errorCount: number;
  methodSummaries: MethodSummary[];
};

/**
 * Metadata describing the simulation run configuration and environment.
 *
 * @property runId - Unique identifier for this run (UUID or fallback).
 * @property startedAt - Unix timestamp when the simulation was constructed.
 * @property endedAt - Unix timestamp when {@link SimulationTracker.complete} was called.
 * @property source - The simulation source kind and code.
 * @property configuration - Snapshot of the simulation options and inputs.
 * @property metadata - Arbitrary caller-supplied metadata.
 */
export type SimulationRunMetadata = {
  runId: string;
  startedAt: number;
  endedAt?: number;
  source: {
    kind: SimulationSource["kind"];
    code: string | { js?: string; wgsl?: string; wasmWat?: string };
  };
  configuration: {
    options: SimulationOptions;
    requiredInputs: string[];
    definedInputs: CompilationResult["definedInputs"];
  };
  metadata?: Record<string, unknown>;
};

/**
 * Complete tracking report for a simulation run, combining metadata,
 * frame records, logs, errors, environment, and summary statistics.
 *
 * Environment is at the top level since it describes the session, not a
 * per-method property.
 */
export type SimulationTrackingReport = {
  run: SimulationRunMetadata;
  environment?: RuntimeMetrics;
  frames: SimulationFrameRecord[];
  logs: SimulationLogEntry[];
  errors: SimulationErrorEntry[];
  summary: SimulationRunSummary;
};

/**
 * Filter options for {@link SimulationTracker.getReport}.
 *
 * @property fromFrame - Minimum frame number (inclusive).
 * @property toFrame - Maximum frame number (inclusive).
 * @property includeAgentPositions - Set to `false` to strip agent snapshots.
 * @property includeInputSnapshots - Set to `false` to strip input snapshots.
 * @property includeLogs - Set to `false` to strip log entries.
 */
export type SimulationTrackingFilter = {
  fromFrame?: number;
  toFrame?: number;
  includeAgentPositions?: boolean;
  includeInputSnapshots?: boolean;
  includeLogs?: boolean;
};

/** @internal Default tracking options applied when no overrides are provided. */
const DEFAULT_TRACKING_OPTIONS: TrackingOptions = {
  enabled: true,
  captureFrameInputs: false,
  captureAgentStates: true,
  captureLogs: true,
  captureDeviceMetrics: true,
  captureRawArrays: false,
};

/**
 * Map the internal {@link LogLevel} enum to a human-readable severity string.
 *
 * @param level - Internal log level.
 * @returns Corresponding severity label.
 * @internal
 */
const mapLogLevel = (level: LogLevel): SimulationLogEntry["level"] => {
  if (level === LogLevel.Error) return "error";
  if (level === LogLevel.Warning) return "warning";
  if (level === LogLevel.Info) return "info";
  return "verbose";
};

/**
 * Generate a unique run identifier.
 *
 * Uses `crypto.randomUUID()` where available, falling back to a
 * timestamp-based identifier.
 *
 * @returns A unique run ID string.
 * @internal
 */
const generateRunId = (): string => {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return `run-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

/**
 * Create a shallow clone of an agent array.
 *
 * @param agents - Source agent array.
 * @returns New array with spread-cloned agents.
 * @internal
 */
const cloneAgents = (agents: Agent[]): Agent[] => {
  return agents.map((agent) => ({ ...agent }));
};

/**
 * Recursively sanitise an input value for safe JSON serialisation.
 *
 * Typed arrays are replaced with `{ type, length }` descriptors by default;
 * when `keepArrays` is true they are converted to regular number arrays.
 * Functions are always replaced with `'[Function]'`.
 *
 * @param value - The raw input value.
 * @param keepArrays - Preserve full typed array contents.
 * @returns A JSON-safe representation.
 * @internal
 */
const sanitizeInputValue = (value: unknown, keepArrays = false): unknown => {
  if (
    typeof value === "number" ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    value === null
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return [];

    if (typeof value[0] === "object") {
      return value.map((item) => {
        if (!item || typeof item !== "object") {
          return item;
        }

        const result: Record<string, unknown> = {};
        for (const [key, nested] of Object.entries(
          item as Record<string, unknown>,
        )) {
          if (
            typeof nested === "number" ||
            typeof nested === "string" ||
            typeof nested === "boolean" ||
            nested == null
          ) {
            result[key] = nested;
          }
        }

        return result;
      });
    }

    return value;
  }

  if (value instanceof Float32Array || value instanceof Uint32Array) {
    if (keepArrays) {
      return Array.from(value);
    }
    return {
      type: value.constructor.name,
      length: value.length,
    };
  }

  if (typeof value === "function") {
    return "[Function]";
  }

  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(
      value as Record<string, unknown>,
    )) {
      result[key] = sanitizeInputValue(nested, keepArrays);
    }
    return result;
  }

  return String(value);
};

/**
 * Records telemetry data throughout a simulation run and produces
 * structured tracking reports.
 *
 * Created internally by the {@link Simulation} class. Listens to the
 * global {@link Logger} for log capture and collects runtime environment
 * metrics on construction.
 */
export class SimulationTracker {
  private readonly options: TrackingOptions;
  private readonly logger = new Logger("SimulationTracker", "teal");
  private readonly run: SimulationRunMetadata;
  private readonly frames: SimulationFrameRecord[] = [];
  private readonly logs: SimulationLogEntry[] = [];
  private readonly errors: SimulationErrorEntry[] = [];
  private environment?: RuntimeMetrics;
  private readonly logListener?: (
    level: LogLevel,
    context: string,
    message: string,
    args: unknown[],
  ) => void;

  /**
   * Create a new tracker for a simulation run.
   *
   * @param params - Initial run configuration used to populate metadata.
   */
  constructor(params: {
    source: SimulationSource;
    options: SimulationOptions;
    compilationResult: CompilationResult;
    tracking?: Partial<TrackingOptions>;
    metadata?: Record<string, unknown>;
  }) {
    this.options = { ...DEFAULT_TRACKING_OPTIONS, ...(params.tracking ?? {}) };

    this.run = {
      runId: generateRunId(),
      startedAt: Date.now(),
      source: {
        kind: params.source.kind,
        code:
          params.source.kind === "dsl"
            ? params.source.code
            : {
                js:
                  typeof params.source.code.js === "function"
                    ? params.source.code.js.toString()
                    : params.source.code.js,
                wgsl: params.source.code.wgsl,
                wasmWat: params.source.code.wasmWat,
              },
      },
      configuration: {
        options: { ...params.options },
        requiredInputs: [...params.compilationResult.requiredInputs],
        definedInputs: params.compilationResult.definedInputs.map((def) => ({
          ...def,
        })),
      },
      metadata: params.metadata,
    };

    if (this.options.captureLogs) {
      this.logListener = (level, context, message) => {
        if (!this.options.enabled) return;

        this.logs.push({
          timestamp: Date.now(),
          level: mapLogLevel(level),
          context,
          message,
        });
      };

      Logger.addListener(this.logListener);
    }
  }

  /**
   * Asynchronously collect runtime device, browser, and GPU metrics.
   *
   * The results are stored for inclusion in tracking reports.
   */
  public async collectEnvironmentMetrics(): Promise<void> {
    if (!this.options.enabled || !this.options.captureDeviceMetrics) {
      return;
    }

    try {
      this.environment = await collectRuntimeMetrics();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to collect runtime metrics: ${message}`);
    }
  }

  /**
   * Record data for a completed simulation frame.
   *
   * @param params - Frame data including agents, inputs, and performance.
   */
  public recordFrame(params: {
    frameNumber: number;
    method: Method;
    renderMode: RenderMode;
    agents: Agent[];
    performance?: FramePerformance;
    inputs?: InputValues;
  }): void {
    if (!this.options.enabled) {
      return;
    }

    this.frames.push({
      frameNumber: params.frameNumber,
      timestamp: Date.now(),
      method: params.method,
      renderMode: params.renderMode,
      agentPositions: this.options.captureAgentStates
        ? cloneAgents(params.agents)
        : undefined,
      inputSnapshot: this.options.captureFrameInputs
        ? Object.fromEntries(
            Object.entries(params.inputs ?? {}).map(([key, value]) => [
              key,
              sanitizeInputValue(value, this.options.captureRawArrays),
            ]),
          )
        : undefined,
      performance: params.performance ? { ...params.performance } : undefined,
    });
  }

  /**
   * Record an error that occurred during frame execution.
   *
   * @param error - The caught error or unknown thrown value.
   */
  public recordError(error: unknown): void {
    if (!this.options.enabled) {
      return;
    }

    if (error instanceof Error) {
      this.errors.push({
        timestamp: Date.now(),
        message: error.message,
        stack: error.stack,
      });
      return;
    }

    this.errors.push({
      timestamp: Date.now(),
      message: String(error),
    });
  }

  /**
   * Mark the simulation run as complete by recording the end timestamp.
   */
  public complete(): void {
    if (!this.options.enabled) {
      return;
    }

    this.run.endedAt = Date.now();
  }

  /**
   * Generate a deep-cloned tracking report, optionally filtered by
   * frame range and content inclusions.
   *
   * @param filter - Optional filter constraints.
   * @returns A self-contained tracking report.
   */
  public getReport(
    filter?: SimulationTrackingFilter,
  ): SimulationTrackingReport {
    const fromFrame = filter?.fromFrame;
    const toFrame = filter?.toFrame;

    const filteredFrames = this.frames.filter((frame) => {
      if (typeof fromFrame === "number" && frame.frameNumber < fromFrame) {
        return false;
      }
      if (typeof toFrame === "number" && frame.frameNumber > toFrame) {
        return false;
      }
      return true;
    });

    const frameView = filteredFrames.map((frame) => ({
      ...frame,
      agentPositions:
        filter?.includeAgentPositions === false
          ? undefined
          : frame.agentPositions?.map((agent) => ({ ...agent })),
      inputSnapshot:
        filter?.includeInputSnapshots === false
          ? undefined
          : frame.inputSnapshot
            ? { ...frame.inputSnapshot }
            : undefined,
      performance: frame.performance ? { ...frame.performance } : undefined,
    }));

    const endedAt = this.run.endedAt ?? Date.now();

    const totalExecutionMs = filteredFrames.reduce(
      (total, frame) => total + (frame.performance?.totalExecutionTime ?? 0),
      0,
    );

    // Build per-method summaries
    const methodGroups = new Map<
      string,
      {
        setup: number;
        compute: number;
        render: number;
        readback: number;
        total: number;
        count: number;
      }
    >();
    for (const frame of filteredFrames) {
      const perf = frame.performance;
      if (!perf) continue;
      let group = methodGroups.get(frame.method);
      if (!group) {
        group = {
          setup: 0,
          compute: 0,
          render: 0,
          readback: 0,
          total: 0,
          count: 0,
        };
        methodGroups.set(frame.method, group);
      }
      group.setup += perf.setupTime ?? 0;
      group.compute += perf.computeTime ?? 0;
      group.render += perf.renderTime ?? 0;
      group.readback += perf.readbackTime ?? 0;
      group.total += perf.totalExecutionTime;
      group.count += 1;
    }

    const methodSummaries: MethodSummary[] = [];
    for (const [method, g] of methodGroups) {
      methodSummaries.push({
        method,
        frameCount: g.count,
        avgSetupTime: g.count > 0 ? g.setup / g.count : 0,
        avgComputeTime: g.count > 0 ? g.compute / g.count : 0,
        avgRenderTime: g.count > 0 ? g.render / g.count : 0,
        avgReadbackTime: g.count > 0 ? g.readback / g.count : 0,
        avgTotalTime: g.count > 0 ? g.total / g.count : 0,
      });
    }

    return {
      run: {
        ...this.run,
        configuration: {
          options: { ...this.run.configuration.options },
          requiredInputs: [...this.run.configuration.requiredInputs],
          definedInputs: this.run.configuration.definedInputs.map((input) => ({
            ...input,
          })),
        },
        metadata: this.run.metadata ? { ...this.run.metadata } : undefined,
      },
      environment: this.environment
        ? {
            device: { ...this.environment.device },
            browser: { ...this.environment.browser },
            gpu: this.environment.gpu ? { ...this.environment.gpu } : undefined,
          }
        : undefined,
      frames: frameView,
      logs:
        filter?.includeLogs === false
          ? []
          : this.logs.map((entry) => ({ ...entry })),
      errors: this.errors.map((entry) => ({ ...entry })),
      summary: {
        frameCount: filteredFrames.length,
        durationMs: Math.max(0, endedAt - this.run.startedAt),
        totalExecutionMs,
        averageExecutionMs:
          filteredFrames.length > 0
            ? totalExecutionMs / filteredFrames.length
            : 0,
        errorCount: this.errors.length,
        methodSummaries,
      },
    };
  }

  /**
   * Remove the global log listener registered by this tracker.
   *
   * Should be called during simulation teardown to prevent memory leaks.
   */
  public dispose(): void {
    if (this.logListener) {
      Logger.removeListener(this.logListener);
    }
  }

  /**
   * Whether this tracker is configured to capture per-frame agent states.
   *
   * @returns `true` if tracking is enabled and agent state capture is on.
   */
  public capturesAgentStates(): boolean {
    return this.options.enabled && this.options.captureAgentStates;
  }
}
