import { describe, expect, it } from "vitest";
import { Simulation } from "../../src/simulation";
import { supportsWasmSIMD } from "../../src/compute/webAssembly";
import type { SimulationTrackingReport } from "../../src/tracking";
import type { WasmExecutionMode } from "../../src/types";

const DSL = `
moveForward(1.2);
turn(0.02);
borderWrapping();
`;

const createSimulation = (wasmExecutionMode: WasmExecutionMode): Simulation => {
  return new Simulation({
    source: { kind: "dsl", code: DSL },
    options: {
      agents: 64,
      width: 256,
      height: 256,
      wasmExecutionMode,
    },
    tracking: {
      enabled: true,
      captureFrameInputs: false,
      captureAgentStates: false,
      captureLogs: false,
      captureDeviceMetrics: false,
      captureRuntimeSamples: false,
    },
  });
};

const runSingleWasmFrame = async (
  wasmExecutionMode: WasmExecutionMode,
): Promise<SimulationTrackingReport> => {
  const simulation = createSimulation(wasmExecutionMode);
  try {
    await simulation.runFrame("WebAssembly", {}, "none");
    await simulation.finalizeTracking();
    return simulation.getTrackingReport();
  } finally {
    simulation.destroy();
  }
};

describe("WASM execution mode", () => {
  it("records scalar execution when wasmExecutionMode='scalar'", async () => {
    const report = await runSingleWasmFrame("scalar");
    const perf = report.frames[0]?.performance;

    expect(report.run.configuration.options.wasmExecutionMode).toBe("scalar");
    expect(perf?.specificStats?.["WASM SIMD Active"]).toBe(0);
    expect(perf?.specificStats?.["WASM SIMD Requested"]).toBe(0);
  });

  it("records auto execution mode and resolves based on SIMD support", async () => {
    const report = await runSingleWasmFrame("auto");
    const perf = report.frames[0]?.performance;
    const simdExpected = supportsWasmSIMD() ? 1 : 0;

    expect(report.run.configuration.options.wasmExecutionMode).toBe("auto");
    expect(perf?.specificStats?.["WASM SIMD Requested"]).toBe(0.5);
    expect(perf?.specificStats?.["WASM SIMD Active"]).toBe(simdExpected);
  });

  it("uses SIMD mode when supported and errors when unsupported", async () => {
    if (!supportsWasmSIMD()) {
      await expect(runSingleWasmFrame("simd")).rejects.toThrow(/SIMD/i);
      return;
    }

    const report = await runSingleWasmFrame("simd");
    const perf = report.frames[0]?.performance;

    expect(report.run.configuration.options.wasmExecutionMode).toBe("simd");
    expect(perf?.specificStats?.["WASM SIMD Requested"]).toBe(1);
    expect(perf?.specificStats?.["WASM SIMD Active"]).toBe(1);
    expect(perf?.specificStats?.["WASM SIMD Memcpy"]).toBeGreaterThanOrEqual(0);
  });
});
