<div align="center">

<br/>

<img src="assets/feature-replay.gif" alt="WebSimBench Feature Overview" width="720" />

<br/>

# WebSimBench

### A high-performance agent-based simulation engine and playground for the web.

Build, run, and benchmark agent based simulations entirely in the browser across **JavaScript**, **WebWorkers**, **WebAssembly**, and **WebGPU** by writing one Agent Script.

<br/>

[![npm](https://img.shields.io/npm/v/@websimbench/agentyx?style=for-the-badge&logo=npm&logoColor=white&label=agentyx&color=00d4ff)](https://www.npmjs.com/package/@websimbench/agentyx)
&nbsp;
[![website](https://img.shields.io/badge/Live_Demo-websimbench.dev-25b8a8?style=for-the-badge&logo=googlechrome&logoColor=white)](https://websimbench.dev)
&nbsp;
[![docs](https://img.shields.io/badge/Docs-Overview-7c3aed?style=for-the-badge&logo=readthedocs&logoColor=white)](https://websimbench.dev/#/docs/latest/overview)

</div>

<br/>

---

<br/>

## Simulation Showcase

Real emergent behaviour produced by the Agentyx DSL, running at 60fps on commodity hardware.

<table>
<tr>
<td align="center" width="25%">
<img src="assets/slime.png" alt="Slime Mold" width="100%" />
<br/><b>Slime Mold</b>
</td>
<td align="center" width="25%">
<img src="assets/fire.png" alt="Fire Spread" width="100%" />
<br/><b>Fire</b>
</td>
<td align="center" width="25%">
<img src="assets/boids.png" alt="Boids Flocking" width="100%" />
<br/><b>Boids</b>
</td>
<td align="center" width="25%">
<img src="assets/cosmic.png" alt="Cosmic" width="100%" />
<br/><b>Cosmic</b>
</td>
</tr>
<tr>
<td align="center" width="25%">
<img src="assets/fluid.png" alt="Fluid Dynamics" width="100%" />
<br/><b>Fluid</b>
</td>
<td align="center" width="25%">
<img src="assets/rain.png" alt="Rainfall" width="100%" />
<br/><b>Rain</b>
</td>
<td align="center" width="25%">
<img src="assets/predator.png" alt="Predator-Prey" width="100%" />
<br/><b>Predator-Prey</b>
</td>
<td align="center" width="25%">
<img src="assets/traffic.png" alt="Traffic Flow" width="100%" />
<br/><b>Traffic</b>
</td>
</tr>
</table>

<br/>

---

<br/>

## Install

```bash
npm install @websimbench/agentyx
```

Agentyx ships a custom **DSL** for describing agent behavior, with a compiler that targets JS, WebWorkers, WASM, and WebGPU — see the full [package docs](./packages/agentyx/README.md).

<br/>

<!-- ## Paper

This project is the product of a full dissertation. The complete paper is included at [`Dissertation__Copy_ (3).pdf`](Dissertation__Copy_%20(3).pdf) in this repository, covering the DSL design, multi-backend compiler pipeline, benchmarking methodology, and results.

<br/> -->

---

<br/>

## Getting Started

```bash
# Clone & install
git clone https://github.com/Morgs27/websimbench.git
cd websimbench
npm install

# Run the dev server
npm run dev
# → http://localhost:5173
```

<br/>

---

<br/>

## Architecture

<div align="center">
<img src="assets/high-level-overview.png" alt="High-Level Overview" width="720" />
</div>

<br/>

Agent scripts are compiled through a multi-stage pipeline that emits optimised code for each backend.

<div align="center">
<img src="assets/compiler-pipeline.png" alt="Compiler Pipeline" width="720" />
</div>

<br/>

<details>
<summary><b>Full Tech Stack</b></summary>
<br/>
<div align="center">
<img src="assets/stack.png" alt="Technology Stack" width="500" />
</div>
</details>

<br/>

---

<br/>

## Benchmark Results

All benchmarks were run across four devices — MacBook M4 Pro, Linux Desktop (RTX 4060), Chromebook (Pixelbook Go), and a Pixel 9 Pro.

### Timing Breakdown — 20 000 Agents

<div align="center">
<img src="assets/timing-breakdown-20k.png" alt="Timing Breakdown at N=20,000" width="800" />
</div>

<br/>

### Cross-Device Compute Time (1 000 Agents)

<table>
<tr>
<td align="center" width="50%">
<img src="assets/compute-time-boids.png" alt="Boids Compute Time" width="100%" />
</td>
<td align="center" width="50%">
<img src="assets/compute-time-slime.png" alt="Slime Compute Time" width="100%" />
</td>
</tr>
</table>

<br/>

### Optimal Worker Count

<div align="center">
<img src="assets/optimal-workers-heatmap.png" alt="Optimal Worker Heatmap" width="640" />
</div>

<br/>

## Contributing

Contributions are welcome! Open an issue or submit a pull request.

</div>
