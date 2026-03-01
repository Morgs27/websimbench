# Agentyx

A high-performance, cross-backend agent-based simulation engine for the web.

Agentyx provides a custom DSL for agent behavior, then compiles it for JavaScript, WebWorkers, WebAssembly, and WebGPU execution.

## Install

```bash
npm i @websimbench/agentyx
```

## Documentation

The documentation is hosted in WebSimBench.

###### [https://websimbench.dev/#/docs/latest/overview](https://websimbench.dev/#/docs/latest/overview)

## Quick Start

```ts
import { Simulation } from "@websimbench/agentyx";

const canvas = document.getElementById("my-canvas") as HTMLCanvasElement;

const simulation = new Simulation({
  canvas,
  source: {
    kind: "dsl",
    code: `
      input speed = 2;
      input turnAngle = 0.5;

      moveForward(inputs.speed);
      turn(inputs.turnAngle);
      borderWrapping();
    `,
  },
  options: { agents: 5000 },
});

await simulation.initGPU();

async function runLoop() {
  await simulation.runFrame("WebGPU", { speed: 3, turnAngle: 0.2 }, "gpu");
  requestAnimationFrame(runLoop);
}

runLoop();
```

## Benchmark Telemetry

Agentyx tracking reports can now capture runtime telemetry suited for scientific benchmarking:

- Per-frame setup/compute/readback/render/compile timings
- WebGPU API bridge breakdowns (`host->GPU`, `GPU->host`, queue submit)
- Method and render-mode summaries (`methodSummaries`, `methodRenderSummaries`)
- Runtime samples (`runtimeSamples`) for JS heap, battery status, and thermal canary drift
- Device/browser/GPU/WASM capability metadata in `environment`

Example tracking options:

```ts
options: {
  agents: 25000,
  wasmExecutionMode: "auto", // "auto" | "scalar" | "simd"
},

tracking: {
  enabled: true,
  captureFrameInputs: true,
  captureDeviceMetrics: true,
  captureRuntimeSamples: true,
  captureJsHeapSamples: true,
  captureBatteryStatus: true,
  captureThermalCanary: true,
  runtimeSampleIntervalMs: 1000,
}
```

`wasmExecutionMode` enables real scalar-vs-SIMD execution splits for WebAssembly benchmarking:

- `"scalar"`: force scalar WASM execution.
- `"simd"`: require SIMD-enabled WASM execution.
- `"auto"`: use SIMD when supported, otherwise scalar fallback.

## Examples

Check out the following examples in the `examples/` directory to see Agentyx in action. These can be run directly in your browser without a build step:

**Basic Setup**

- [JavaScript Backend](./examples/basic-setup/example-js.html)
- [WebWorkers Backend](./examples/basic-setup/example-workers.html)
- [WebAssembly Backend](./examples/basic-setup/example-wasm.html)
- [WebGPU Backend](./examples/basic-setup/example-webgpu.html)

**Features**

- [Advanced Demo](./examples/features/advanced-demo.html)
- [Benchmark Data](./examples/features/benchmark-data.html)
- [Changing Style](./examples/features/changing-style.html)
- [FPS Counter](./examples/features/fps-counter.html)
- [Realtime Sliders](./examples/features/realtime-sliders.html)
