import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";

import { EditorPanel } from "../components/Home/EditorPanel";
import { LogsPanel } from "../components/Home/LogsPanel";
import { CanvasArea } from "../components/Home/CanvasArea";
import { NavDropdown } from "@/components/ui/nav-dropdown";
import { Gamepad2Icon, ZapIcon } from "lucide-react";
import { Method } from "@websimbench/agentyx";
import "../components/Home/Controls/ControlPanels.css";

import { useCodeCompiler } from "../hooks/useCodeCompiler";
import { useSimulationRunner } from "../hooks/useSimulationRunner";
import { useLogger } from "../hooks/useLogger";
import { useObstacles } from "../hooks/useObstacles";
import { useBenchmark } from "../hooks/useBenchmark";
import { useBenchmarkDB, getRunBlob } from "../hooks/useBenchmarkDB";

import { useState, useCallback } from "react";
import { Gear } from "@phosphor-icons/react";
import {
  SimulationAppearanceOptions,
  UpdateOptionFn,
} from "@/hooks/useSimulationOptions";
import { OptionsView } from "./OptionsView";
import { HeaderIconButton } from "@/components/ui/header-icon-button";
import "./PageLayouts.css";

interface HomeProps {
  options: SimulationAppearanceOptions;
  updateOption: UpdateOptionFn;
  resetOptions: () => void;
}

/**
 * Principal workbench view for simulating and testing agent logic.
 * Contains the canvas playground, real-time code editor, and options panel.
 */
export const Home = ({ options, updateOption, resetOptions }: HomeProps) => {
  const OBSTACLE_SIZE = 50;
  const OBSTACLE_HALF_SIZE = OBSTACLE_SIZE / 2;

  const [optionsOpen, setOptionsOpen] = useState(false);

  const {
    code,
    setCode,
    simulationName,
    setSimulationName,
    compiledCode,
    inputs,
    definedInputs,
    isCompiling,
    compileErrors,
    handleInputChange,
    handleSaveCode,
    handleLoadCode,
  } = useCodeCompiler();

  const { obstacles, isPlacing, setIsPlacing, addObstacle, clearObstacles } =
    useObstacles();

  const {
    method,
    setMethod,
    renderMode,
    setRenderMode,
    fps,
    isRunning,
    hasStartedSimulation,
    canvasRef,
    gpuCanvasRef,
    handleRun,
  } = useSimulationRunner(code, inputs, options, obstacles);

  const { logs, clearLogs } = useLogger();

  // --- Benchmark ---
  const benchmark = useBenchmark();
  const benchmarkDB = useBenchmarkDB();

  const slugify = (name: string): string =>
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "simulation";

  const handleBenchmarkRun = useCallback(async () => {
    if (!canvasRef.current) return;
    const res = await benchmark.runBenchmark(
      code,
      benchmark.config,
      canvasRef.current,
      gpuCanvasRef.current ?? undefined,
      simulationName,
    );
    if (res) {
      // Auto-save to IndexedDB
      const { entry, combinedBlob } = await benchmark.buildEntry(res);
      await benchmarkDB.saveBenchmark(entry, combinedBlob);
    }
  }, [code, benchmark, canvasRef, gpuCanvasRef, benchmarkDB, simulationName]);

  const handleBenchmarkDownload = useCallback(
    async (index: number) => {
      if (!benchmark.result) return;
      const r = benchmark.result.reports[index];
      if (!r) return;
      const blob = await getRunBlob(r.runBlobKey);
      if (!blob) return;
      const simSlug = slugify(
        benchmark.result.simulationName || simulationName,
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${simSlug}_${r.method.toLowerCase()}_${r.agentCount}.json`;
      a.click();
      URL.revokeObjectURL(url);
    },
    [benchmark.result, simulationName],
  );

  const handleBenchmarkDownloadFullReport = useCallback(async () => {
    if (!benchmark.result) return;
    const { combinedBlob } = await benchmark.buildEntry(benchmark.result);
    const simSlug = slugify(benchmark.result.simulationName || simulationName);
    const url = URL.createObjectURL(combinedBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${simSlug}_benchmark_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [benchmark, simulationName]);

  const handleBenchmarkSave = useCallback(async () => {
    if (!benchmark.result) return;
    const { entry, combinedBlob } = await benchmark.buildEntry(
      benchmark.result,
    );
    await benchmarkDB.saveBenchmark(entry, combinedBlob);
  }, [benchmark, benchmarkDB]);

  const handleDownloadRecent = useCallback(
    async (id: string) => {
      const entry = benchmarkDB.entries.find((e) => e.id === id);
      const blob = await benchmarkDB.getReportBlob(id);
      if (!blob) return;
      const simSlug = slugify(entry?.label || simulationName);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${simSlug}_benchmark_${id.slice(0, 8)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    },
    [benchmarkDB, simulationName],
  );

  const handlePlaceObstacle = (
    x: number,
    y: number,
    simulationWidth: number,
    simulationHeight: number,
  ) => {
    const maxX = Math.max(simulationWidth - OBSTACLE_SIZE, 0);
    const maxY = Math.max(simulationHeight - OBSTACLE_SIZE, 0);

    addObstacle({
      x: Math.min(Math.max(x - OBSTACLE_HALF_SIZE, 0), maxX),
      y: Math.min(Math.max(y - OBSTACLE_HALF_SIZE, 0), maxY),
      w: OBSTACLE_SIZE,
      h: OBSTACLE_SIZE,
    });
  };

  const activeRenderMode = renderMode;
  const canRunSimulation = code.trim().length > 0;

  // Build display value for dropdown
  const dropdownValue =
    method === "WebGPU"
      ? activeRenderMode === "gpu"
        ? "WebGPU (GPU)"
        : "WebGPU (CPU)"
      : method;

  const isMobile = window.innerWidth < 800;

  return (
    <PanelGroup direction={isMobile ? "vertical" : "horizontal"}>
      <Panel defaultSize={50} minSize={20}>
        <PanelGroup direction="vertical">
          <Panel defaultSize={80} minSize={20}>
            <EditorPanel
              code={code}
              setCode={setCode}
              simulationName={simulationName}
              setSimulationName={setSimulationName}
              handleSaveCode={handleSaveCode}
              handleLoadCode={handleLoadCode}
              compiledCode={compiledCode}
              isCompiling={isCompiling}
              compileErrors={compileErrors}
            />
          </Panel>

          {!isMobile && <PanelResizeHandle className="panel-resize-row" />}

          {!isMobile && (
            <Panel defaultSize={20} minSize={10}>
              <LogsPanel logs={logs} onClear={clearLogs} />
            </Panel>
          )}
        </PanelGroup>
      </Panel>

      {isMobile ? (
        <PanelResizeHandle className="panel-resize-row" />
      ) : (
        <PanelResizeHandle className="panel-resize-col" />
      )}

      <Panel defaultSize={50} minSize={20}>
        <div className="page-container">
          <div className="page-header-compact gap-4 justify-start">
            <div className="control-row">
              <div className="control-item min-w-[150px]">
                <NavDropdown
                  icon={<Gamepad2Icon size={16} />}
                  label="Playground"
                  value={dropdownValue}
                  disabled={benchmark.isBenchmarkMode}
                  onValueChange={(v) => {
                    if (v === "WebGPU (GPU)") {
                      setMethod("WebGPU");
                      setRenderMode("gpu");
                    } else if (v === "WebGPU (CPU)") {
                      setMethod("WebGPU");
                      setRenderMode("cpu");
                    } else {
                      setMethod(v as Method);
                      setRenderMode("cpu");
                    }
                  }}
                  options={[
                    { value: "JavaScript", label: "JavaScript" },
                    { value: "WebAssembly", label: "WebAssembly" },
                    { value: "WebWorkers", label: "WebWorkers" },
                    { value: "WebGPU (CPU)", label: "WebGPU (CPU)" },
                    { value: "WebGPU (GPU)", label: "WebGPU (GPU)" },
                  ]}
                />
              </div>
            </div>

            <button
              onClick={() =>
                benchmark.setIsBenchmarkMode(!benchmark.isBenchmarkMode)
              }
              title={
                benchmark.isBenchmarkMode
                  ? "Exit Benchmark Mode"
                  : "Enter Benchmark Mode"
              }
              className={`benchmark-toggle ${benchmark.isBenchmarkMode ? "benchmark-toggle--on" : ""}`}
            >
              <ZapIcon size={14} />
              <span>
                {benchmark.isBenchmarkMode ? "Benchmarking" : "Benchmark"}
              </span>
              <span className="benchmark-toggle-pill">
                <span className="benchmark-toggle-knob" />
              </span>
            </button>

            <HeaderIconButton
              onClick={() => setOptionsOpen(true)}
              title="System Configuration"
              icon={<Gear size={14} weight="fill" />}
              label="Options"
              className="hide-mobile"
            />
          </div>

          <PanelGroup direction="vertical">
            <Panel defaultSize={100} minSize={20}>
              <div className="home-canvas-container">
                <CanvasArea
                  canvasRef={canvasRef}
                  gpuCanvasRef={gpuCanvasRef}
                  renderMode={activeRenderMode === "gpu" ? "gpu" : "cpu"}
                  isHidden={false}
                  isPlacing={isPlacing}
                  setIsPlacing={setIsPlacing}
                  onPlaceObstacle={handlePlaceObstacle}
                  onClearObstacles={clearObstacles}
                  obstacles={obstacles}
                  options={options}
                  fps={fps}
                  hideObstaclesUI={false}
                  inputs={inputs}
                  definedInputs={definedInputs}
                  handleInputChange={handleInputChange}
                  isRunning={isRunning}
                  handleRun={handleRun}
                  canRun={canRunSimulation}
                  showPlaceholder={
                    !benchmark.isBenchmarkMode &&
                    !hasStartedSimulation &&
                    obstacles.length === 0
                  }
                  placeholderText="Run the simulation to start."
                  isBenchmarkMode={benchmark.isBenchmarkMode}
                  benchmarkConfig={benchmark.config}
                  benchmarkUpdateConfig={benchmark.updateConfig}
                  benchmarkStatus={benchmark.status}
                  benchmarkProgress={benchmark.progress}
                  benchmarkResult={benchmark.result}
                  onBenchmarkRun={handleBenchmarkRun}
                  onBenchmarkStop={benchmark.stopBenchmark}
                  onBenchmarkReset={benchmark.resetBenchmark}
                  onBenchmarkDownload={handleBenchmarkDownload}
                  onBenchmarkDownloadFullReport={
                    handleBenchmarkDownloadFullReport
                  }
                  onBenchmarkSave={handleBenchmarkSave}
                  benchmarkRecentEntries={benchmarkDB.entries}
                  onBenchmarkDownloadRecent={handleDownloadRecent}
                  onBenchmarkDeleteRecent={benchmarkDB.deleteBenchmark}
                />
              </div>
            </Panel>
          </PanelGroup>
        </div>
      </Panel>

      <OptionsView
        options={options}
        updateOption={updateOption}
        resetOptions={resetOptions}
        open={optionsOpen}
        onOpenChange={setOptionsOpen}
      />
    </PanelGroup>
  );
};
