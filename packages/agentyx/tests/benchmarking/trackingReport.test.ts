import { afterEach, describe, expect, it, vi } from "vitest";
import { collectRuntimeMetrics } from "../../src/helpers/deviceInfo";
import { SimulationTracker } from "../../src/tracking";
import type { CompilationResult } from "../../src/types";

const BASE_COMPILATION_RESULT: CompilationResult = {
  requiredInputs: ["speed", "turnAngle"],
  definedInputs: [{ name: "speed", defaultValue: 1 }],
  wgslCode: "",
  jsCode: "(agent) => agent",
  WASMCode: "(module ;; v128 atomic. )",
  numRandomCalls: 0,
};

const makeTracker = (overrides?: {
  compilationResult?: CompilationResult;
  tracking?: Record<string, unknown>;
}) => {
  return new SimulationTracker({
    source: { kind: "dsl", code: "moveForward(inputs.speed);" },
    options: { agents: 100, width: 800, height: 600 },
    compilationResult: overrides?.compilationResult ?? BASE_COMPILATION_RESULT,
    tracking: {
      enabled: true,
      captureLogs: false,
      captureFrameInputs: true,
      captureAgentStates: false,
      captureDeviceMetrics: false,
      captureRuntimeSamples: false,
      ...(overrides?.tracking ?? {}),
    },
    metadata: { suite: "benchmarking-test" },
  });
};

afterEach(() => {
  vi.useRealTimers();
});

describe("Benchmarking report metrics", () => {
  it("computes method/render/input/agent/frame stats correctly", () => {
    const tracker = makeTracker();

    tracker.recordFrame({
      frameNumber: 0,
      method: "WebGPU",
      renderMode: "gpu",
      agents: [],
      inputs: { speed: 1, width: 800, height: 600 },
      performance: {
        method: "WebGPU",
        agentCount: 100,
        agentPerformance: [],
        totalExecutionTime: 10,
        frameTimestamp: Date.now(),
        setupTime: 1,
        computeTime: 2,
        readbackTime: 3,
        renderTime: 4,
        compileTime: 5,
        bridgeTimings: { hostToGpuTime: 6, gpuToHostTime: 7 },
        memoryStats: {
          usedJsHeapSizeBytes: 100,
          methodMemoryFootprintBytes: 1000,
        },
      },
    });

    tracker.recordFrame({
      frameNumber: 1,
      method: "WebGPU",
      renderMode: "cpu",
      agents: [],
      inputs: { speed: 2, width: 800 },
      performance: {
        method: "WebGPU",
        agentCount: 100,
        agentPerformance: [],
        totalExecutionTime: 20,
        frameTimestamp: Date.now(),
        setupTime: 2,
        computeTime: 4,
        readbackTime: 6,
        renderTime: 8,
        bridgeTimings: { hostToGpuTime: 3, gpuToHostTime: 9 },
        memoryStats: {
          usedJsHeapSizeBytes: 200,
          methodMemoryFootprintBytes: 2000,
        },
      },
    });

    tracker.recordFrame({
      frameNumber: 2,
      method: "JavaScript",
      renderMode: "none",
      agents: [],
      inputs: { speed: 3, turnAngle: 0.2, width: 800, extra: 1 },
      performance: {
        method: "JavaScript",
        agentCount: 50,
        agentPerformance: [],
        totalExecutionTime: 30,
        frameTimestamp: Date.now(),
        setupTime: 3,
        computeTime: 6,
        readbackTime: 9,
        renderTime: 12,
        bridgeTimings: { hostToGpuTime: 0, gpuToHostTime: 0 },
        memoryStats: {
          usedJsHeapSizeBytes: 300,
          methodMemoryFootprintBytes: 500,
        },
      },
    });

    tracker.complete();
    const report = tracker.getReport();

    expect(report.summary.frameCount).toBe(3);
    expect(report.summary.totalExecutionMs).toBe(60);
    expect(report.summary.averageExecutionMs).toBeCloseTo(20, 5);

    const webgpu = report.summary.methodSummaries.find(
      (s) => s.method === "WebGPU",
    );
    expect(webgpu).toBeDefined();
    expect(webgpu?.frameCount).toBe(2);
    expect(webgpu?.avgSetupTime).toBeCloseTo(1.5, 5);
    expect(webgpu?.avgComputeTime).toBeCloseTo(3, 5);
    expect(webgpu?.avgReadbackTime).toBeCloseTo(4.5, 5);
    expect(webgpu?.avgRenderTime).toBeCloseTo(6, 5);
    expect(webgpu?.avgCompileTime).toBeCloseTo(5, 5);
    expect(webgpu?.compileEvents).toBe(1);

    const webgpuGpu = report.summary.methodRenderSummaries.find(
      (s) => s.method === "WebGPU" && s.renderMode === "gpu",
    );
    expect(webgpuGpu?.frameCount).toBe(1);
    expect(webgpuGpu?.avgHostToGpuBridgeTime).toBeCloseTo(6, 5);
    expect(webgpuGpu?.avgGpuToHostBridgeTime).toBeCloseTo(7, 5);
    expect(webgpuGpu?.avgMethodMemoryFootprintBytes).toBeCloseTo(1000, 5);

    const webgpuCpu = report.summary.methodRenderSummaries.find(
      (s) => s.method === "WebGPU" && s.renderMode === "cpu",
    );
    expect(webgpuCpu?.frameCount).toBe(1);
    expect(webgpuCpu?.avgHostToGpuBridgeTime).toBeCloseTo(3, 5);
    expect(webgpuCpu?.avgGpuToHostBridgeTime).toBeCloseTo(9, 5);
    expect(webgpuCpu?.avgMethodMemoryFootprintBytes).toBeCloseTo(2000, 5);

    const jsHeadless = report.summary.methodRenderSummaries.find(
      (s) => s.method === "JavaScript" && s.renderMode === "none",
    );
    expect(jsHeadless?.frameCount).toBe(1);
    expect(jsHeadless?.avgRenderTime).toBeCloseTo(12, 5);
    expect(jsHeadless?.avgMethodMemoryFootprintBytes).toBeCloseTo(500, 5);

    expect(report.summary.inputStats.requiredInputCount).toBe(2);
    expect(report.summary.inputStats.definedInputCount).toBe(1);
    expect(report.summary.inputStats.minKeysPerFrame).toBe(2);
    expect(report.summary.inputStats.maxKeysPerFrame).toBe(4);
    expect(report.summary.inputStats.averageKeysPerFrame).toBeCloseTo(3, 5);

    expect(report.summary.agentStats.minAgentsPerFrame).toBe(50);
    expect(report.summary.agentStats.maxAgentsPerFrame).toBe(100);
    expect(report.summary.agentStats.averageAgentsPerFrame).toBeCloseTo(
      250 / 3,
      5,
    );

    expect(report.summary.frameTimeStats.min).toBe(10);
    expect(report.summary.frameTimeStats.max).toBe(30);
    expect(report.summary.frameTimeStats.average).toBeCloseTo(20, 5);
    expect(report.summary.frameTimeStats.p50).toBeCloseTo(20, 5);
    expect(report.summary.frameTimeStats.p95).toBeCloseTo(29, 5);

    expect(report.summary.runtimeSampling?.jsHeap?.sampleCount).toBe(3);
    expect(report.summary.runtimeSampling?.jsHeap?.startBytes).toBe(100);
    expect(report.summary.runtimeSampling?.jsHeap?.endBytes).toBe(300);
    expect(report.summary.runtimeSampling?.jsHeap?.deltaBytes).toBe(200);

    expect(
      report.run.configuration.wasmCodeFeatures?.simdInstructionsPresent,
    ).toBe(true);
    expect(
      report.run.configuration.wasmCodeFeatures?.threadsInstructionsPresent,
    ).toBe(true);

    expect(report.frames[0].inputSnapshot?.speed).toBe(1);
    expect(report.frames[2].inputKeyCount).toBe(4);
    expect(report.frames[0].performance?.bridgeTimings?.hostToGpuTime).toBe(6);
    expect(report.frames[1].performance?.bridgeTimings?.gpuToHostTime).toBe(9);
    expect(report.frames[2].performance?.memoryStats?.usedJsHeapSizeBytes).toBe(
      300,
    );
    expect(report.run.endedAt).toBeDefined();

    tracker.dispose();
  });

  it("uses compact agent input snapshots by default", () => {
    const tracker = makeTracker({
      tracking: {
        captureFrameInputs: true,
        captureRawArrays: false,
      },
    });

    tracker.recordFrame({
      frameNumber: 0,
      method: "JavaScript",
      renderMode: "none",
      agents: [],
      inputs: {
        agents: [
          { id: 1, x: 1, y: 2, vx: 3, vy: 4, species: 0 },
          { id: 2, x: 5, y: 6, vx: 7, vy: 8, species: 0 },
        ],
      },
      performance: {
        method: "JavaScript",
        agentCount: 2,
        agentPerformance: [],
        totalExecutionTime: 1,
        frameTimestamp: Date.now(),
      },
    });

    tracker.complete();

    const report = tracker.getReport();
    expect(report.frames[0].inputSnapshot?.agents).toEqual({
      type: "AgentArray",
      length: 2,
    });

    tracker.dispose();
  });

  it("finalize waits for stable report end-state", async () => {
    vi.useFakeTimers();

    const tracker = makeTracker({
      tracking: {
        captureRuntimeSamples: true,
        captureThermalCanary: true,
        runtimeSampleIntervalMs: 100,
      },
    });

    tracker.recordFrame({
      frameNumber: 0,
      method: "JavaScript",
      renderMode: "none",
      agents: [],
      inputs: { speed: 1 },
      performance: {
        method: "JavaScript",
        agentCount: 1,
        agentPerformance: [],
        totalExecutionTime: 1,
        frameTimestamp: Date.now(),
      },
    });

    await vi.advanceTimersByTimeAsync(220);
    await tracker.finalize();

    const report = tracker.getReport();
    expect(report.run.endedAt).toBeDefined();
    expect(report.runtimeSamples.length).toBeGreaterThanOrEqual(2);
    expect(report.summary.durationMs).toBeGreaterThanOrEqual(0);

    tracker.dispose();
  });

  it("captures runtime sampling and thermal canary summaries", async () => {
    vi.useFakeTimers();

    const tracker = makeTracker({
      tracking: {
        captureRuntimeSamples: true,
        captureJsHeapSamples: false,
        captureBatteryStatus: false,
        captureThermalCanary: true,
        runtimeSampleIntervalMs: 100,
      },
    });

    tracker.recordFrame({
      frameNumber: 0,
      method: "JavaScript",
      renderMode: "none",
      agents: [],
      inputs: { speed: 1 },
      performance: {
        method: "JavaScript",
        agentCount: 10,
        agentPerformance: [],
        totalExecutionTime: 1,
        frameTimestamp: Date.now(),
      },
    });

    await vi.advanceTimersByTimeAsync(450);

    tracker.complete();

    // Flush async sample promises queued by setInterval callbacks.
    await Promise.resolve();

    const report = tracker.getReport();

    expect(report.runtimeSamples.length).toBeGreaterThanOrEqual(4);
    expect(report.summary.runtimeSampling?.thermalCanary).toBeDefined();
    expect(
      report.summary.runtimeSampling?.thermalCanary?.sampleIntervalMs,
    ).toBe(100);
    expect(report.summary.runtimeSampling?.thermalCanary?.sampleCount).toBe(
      report.runtimeSamples.filter((s) => s.thermalCanary).length,
    );

    tracker.dispose();
  });

  it("collectRuntimeMetrics includes wasm capabilities payload", async () => {
    const metrics = await collectRuntimeMetrics();

    expect(metrics).toBeDefined();
    expect(metrics.wasm).toBeDefined();
    expect(typeof metrics.wasm.simdSupported).toBe("boolean");
    expect(typeof metrics.wasm.threadsSupported).toBe("boolean");
    expect(typeof metrics.wasm.sharedArrayBufferAvailable).toBe("boolean");

    if (metrics.battery) {
      expect(typeof metrics.battery.supported).toBe("boolean");
    }
  });
});
