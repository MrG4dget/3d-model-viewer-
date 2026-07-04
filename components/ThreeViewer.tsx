'use client';

import React, { useState, Suspense, useRef, useEffect, useCallback } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Stage, Html, Line } from '@react-three/drei';
import { 
  Upload, X, AlertCircle, Loader2, Ruler, Info, Trash2, Copy, Check, 
  MousePointerClick, Scale, FileJson, Box, Settings2, Sliders 
} from 'lucide-react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import JSZip from 'jszip';

// Custom Model component using native GLTFLoader and LoadingManager to resolve separate textures and .bin files
function Model({ 
  url, 
  fileMap, 
  onError,
  onLoaded,
  onClick,
  onPointerMove,
  onPointerOut
}: { 
  url: string; 
  fileMap: { [key: string]: string }; 
  onError: (msg: string) => void; 
  onLoaded?: (gltf: any) => void;
  onClick?: (e: any) => void;
  onPointerMove?: (e: any) => void;
  onPointerOut?: () => void;
}) {
  const [gltf, setGltf] = useState<any>(null);

  useEffect(() => {
    let active = true;
    const manager = new THREE.LoadingManager();

    // Map relative file requests inside the GLTF to our blob URLs
    manager.setURLModifier((requestUrl) => {
      const decodedUrl = decodeURIComponent(requestUrl);
      const filename = decodedUrl.split('/').pop()?.toLowerCase();
      if (filename && fileMap[filename]) {
        return fileMap[filename];
      }
      return requestUrl;
    });

    const loader = new GLTFLoader(manager);
    loader.load(
      url,
      (loadedGltf) => {
        if (active) {
          setGltf(loadedGltf);
          if (onLoaded) {
            onLoaded(loadedGltf);
          }
        }
      },
      undefined,
      (err: any) => {
        console.error("GLTFLoader error:", err);
        if (active) {
          onError(err?.message || "Failed to parse the 3D model. Make sure all texture and .bin files are selected alongside the .gltf file.");
        }
      }
    );

    return () => {
      active = false;
    };
  }, [url, fileMap, onError, onLoaded]);

  if (!gltf) return null;

  return (
    <primitive 
      object={gltf.scene} 
      onClick={onClick}
      onPointerMove={onPointerMove}
      onPointerOver={onPointerMove}
      onPointerOut={onPointerOut}
    />
  );
}

// Subcomponent to visualize measurements in 3D world space
function MeasurementLayer({
  points,
  hoveredPoint,
  modelSize,
  unitLabel,
  unitFactor
}: {
  points: THREE.Vector3[];
  hoveredPoint: THREE.Vector3 | null;
  modelSize: number;
  unitLabel: string;
  unitFactor: number;
}) {
  const sphereRadius = modelSize * 0.012; // Dynamic size based on model bounds
  const activeColor = "#f43f5e"; // rose-500
  const previewColor = "#fda4af"; // rose-300

  const distance = points.length === 2 ? points[0].distanceTo(points[1]) : 0;
  const midpoint = points.length === 2 
    ? new THREE.Vector3().addVectors(points[0], points[1]).multiplyScalar(0.5)
    : null;

  return (
    <group>
      {/* Visualise confirmed points */}
      {points.map((pt, idx) => (
        <mesh key={idx} position={pt}>
          <sphereGeometry args={[sphereRadius, 32, 32]} />
          <meshBasicMaterial color={activeColor} depthTest={false} depthWrite={false} />
        </mesh>
      ))}

      {/* Visualise active measurement line */}
      {points.length === 2 && (
        <>
          <Line
            points={[points[0], points[1]]}
            color={activeColor}
            lineWidth={3}
            depthTest={false}
          />
          {midpoint && (
            <Html position={midpoint} center>
              <div className="bg-zinc-950/95 border border-zinc-800 text-rose-300 px-2.5 py-1 rounded-lg shadow-2xl text-xs font-mono whitespace-nowrap flex items-center gap-1.5 backdrop-blur-md pointer-events-none select-none font-semibold animate-fade-in">
                <span className="w-1.5 h-1.5 bg-rose-500 rounded-full shrink-0" />
                <span>{(distance * unitFactor).toFixed(3)} {unitLabel}</span>
              </div>
            </Html>
          )}
        </>
      )}

      {/* Trailing guide line */}
      {points.length === 1 && hoveredPoint && (
        <>
          <Line
            points={[points[0], hoveredPoint]}
            color={previewColor}
            lineWidth={1.5}
            dashed
            dashScale={40}
            gapSize={1}
            dashSize={1}
            depthTest={false}
          />
          <mesh position={hoveredPoint}>
            <sphereGeometry args={[sphereRadius * 0.7, 16, 16]} />
            <meshBasicMaterial color={previewColor} opacity={0.6} transparent depthTest={false} depthWrite={false} />
          </mesh>
        </>
      )}
    </group>
  );
}

export default function ThreeViewer() {
  const [modelUrl, setModelUrl] = useState<string | null>(null);
  const [modelName, setModelName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [fileMap, setFileMap] = useState<{ [key: string]: string }>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Measurement & Unit Scaling State
  const [isMeasuring, setIsMeasuring] = useState(false);
  const [points, setPoints] = useState<THREE.Vector3[]>([]);
  const [hoveredPoint, setHoveredPoint] = useState<THREE.Vector3 | null>(null);
  const [modelSize, setModelSize] = useState<number>(1);
  const [copied, setCopied] = useState(false);

  // Advanced metadata & scaling
  const [modelMetadata, setModelMetadata] = useState<{
    generator?: string;
    version?: string;
    copyright?: string;
    extras?: any;
    dimensions?: { x: number; y: number; z: number };
    detectedUnit?: string;
    detectedLabel?: string;
    detectedFactor?: number;
    hasCalibrationAdvice?: boolean;
    calibrationAdvice?: string;
  } | null>(null);

  const [selectedUnit, setSelectedUnit] = useState<string>('m');
  const [unitFactor, setUnitFactor] = useState<number>(1);
  const [unitLabel, setUnitLabel] = useState<string>('m');
  const [showMetadata, setShowMetadata] = useState<boolean>(false);

  const handleModelLoaded = useCallback((gltf: any) => {
    const box = new THREE.Box3().setFromObject(gltf.scene);
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    setModelSize(maxDim || 1);

    // Extract glTF metadata
    const asset = gltf.parser?.json?.asset || {};
    const generator = asset.generator || 'Unknown Exporter';
    const version = asset.version || '2.0';
    const copyright = asset.copyright || '';

    let detectedUnit = 'm';
    let detectedFactor = 1;
    let detectedLabel = 'm';
    let hasCalibrationAdvice = false;
    let calibrationAdvice = '';

    // Search helper for embedded unit settings
    const searchMetadata = (obj: any): string | null => {
      if (!obj || typeof obj !== 'object') return null;
      for (const key of Object.keys(obj)) {
        const value = obj[key];
        if (typeof value === 'string') {
          const lowerKey = key.toLowerCase();
          const lowerVal = value.toLowerCase();
          if (lowerKey.includes('unit') || lowerKey.includes('scale')) {
            if (lowerVal.includes('mm') || lowerVal.includes('millimeter')) return 'mm';
            if (lowerVal.includes('cm') || lowerVal.includes('centimeter')) return 'cm';
            if (lowerVal.includes('inch') || lowerVal.includes('in')) return 'in';
            if (lowerVal.includes('feet') || lowerVal.includes('ft') || lowerVal.includes('foot')) return 'ft';
            if (lowerVal.includes('meter') || lowerVal.includes('m')) return 'm';
          }
        } else if (typeof value === 'object') {
          const result = searchMetadata(value);
          if (result) return result;
        }
      }
      return null;
    };

    const foundUnit = searchMetadata(asset) || searchMetadata(gltf.scene?.userData);

    const lowerGen = generator.toLowerCase();
    if (foundUnit) {
      detectedUnit = foundUnit;
      hasCalibrationAdvice = true;
      calibrationAdvice = `Auto-detected explicit unit configuration '${foundUnit}' in file headers.`;
    } else if (
      lowerGen.includes('solidworks') || 
      lowerGen.includes('rhino') || 
      lowerGen.includes('inventor') || 
      lowerGen.includes('fusion') || 
      lowerGen.includes('cad') || 
      lowerGen.includes('autodesk') ||
      lowerGen.includes('revit') ||
      lowerGen.includes('sketchup')
    ) {
      detectedUnit = 'mm';
      hasCalibrationAdvice = true;
      calibrationAdvice = `CAD designs standardly export with 1 unit = 1 millimeter. Display scaling set to Millimeters.`;
    } else if (lowerGen.includes('blender')) {
      detectedUnit = 'm';
      hasCalibrationAdvice = true;
      calibrationAdvice = `Blender exports standardly align with 1 unit = 1 meter. Display scaling set to Meters.`;
    }

    if (detectedUnit === 'mm') {
      detectedFactor = 1000;
      detectedLabel = 'mm';
    } else if (detectedUnit === 'cm') {
      detectedFactor = 100;
      detectedLabel = 'cm';
    } else if (detectedUnit === 'in') {
      detectedFactor = 39.3701;
      detectedLabel = 'in';
    } else if (detectedUnit === 'ft') {
      detectedFactor = 3.28084;
      detectedLabel = 'ft';
    } else {
      detectedFactor = 1;
      detectedLabel = 'm';
    }

    setSelectedUnit(detectedUnit);
    setUnitFactor(detectedFactor);
    setUnitLabel(detectedLabel);

    setModelMetadata({
      generator,
      version,
      copyright,
      extras: asset.extras,
      dimensions: { x: size.x, y: size.y, z: size.z },
      detectedUnit,
      detectedLabel,
      detectedFactor,
      hasCalibrationAdvice,
      calibrationAdvice
    });
  }, []);

  const handleModelClick = useCallback((e: any) => {
    if (!isMeasuring) return;
    e.stopPropagation();
    const clickedPoint = e.point.clone();
    setPoints((prev) => {
      if (prev.length === 2) {
        return [clickedPoint];
      } else {
        return [...prev, clickedPoint];
      }
    });
  }, [isMeasuring]);

  const handleModelPointerMove = useCallback((e: any) => {
    if (!isMeasuring || points.length !== 1) return;
    e.stopPropagation();
    setHoveredPoint(e.point.clone());
  }, [isMeasuring, points]);

  const handleModelPointerOut = useCallback(() => {
    if (!isMeasuring) return;
    setHoveredPoint(null);
  }, [isMeasuring]);

  // Revoke blob URLs helper
  const revokeAllUrls = (currentMap: { [key: string]: string }) => {
    Object.values(currentMap).forEach(url => {
      try {
        URL.revokeObjectURL(url);
      } catch (err) {
        console.error("Failed to revoke URL:", err);
      }
    });
  };

  // Process selected or dropped files (including ZIP archives)
  const handleFiles = useCallback(async (files: FileList | File[]) => {
    setError(null);
    if (!files || files.length === 0) return;

    const fileList = Array.from(files);
    
    // Check if any file is a ZIP archive
    const zipFile = fileList.find(f => f.name.toLowerCase().endsWith('.zip'));

    if (zipFile) {
      setIsProcessing(true);
      try {
        const zip = await JSZip.loadAsync(zipFile);
        const extractedFileMap: { [key: string]: string } = {};
        let mainModelPath: string | null = null;
        let mainModelName: string | null = null;

        // Revoke previous URLs
        revokeAllUrls(fileMap);

        const promises: Promise<void>[] = [];

        zip.forEach((relativePath, zipEntry) => {
          if (!zipEntry.dir) {
            const lowercasePath = relativePath.toLowerCase();
            const leafName = relativePath.split('/').pop()?.toLowerCase() || lowercasePath;

            const promise = zipEntry.async('blob').then((blob) => {
              const url = URL.createObjectURL(blob);
              extractedFileMap[lowercasePath] = url;
              extractedFileMap[leafName] = url;

              // Check if this is the main 3D model file inside the zip
              if (lowercasePath.endsWith('.gltf') || lowercasePath.endsWith('.glb')) {
                // Prioritize .gltf or first .glb
                if (!mainModelPath || lowercasePath.endsWith('.gltf')) {
                  mainModelPath = lowercasePath;
                  mainModelName = relativePath.split('/').pop() || relativePath;
                }
              }
            });
            promises.push(promise);
          }
        });

        await Promise.all(promises);

        if (!mainModelPath) {
          throw new Error("No .glb or .gltf model file was found inside the uploaded ZIP archive.");
        }

        setFileMap(extractedFileMap);
        setModelUrl(extractedFileMap[mainModelPath]);
        setModelName(mainModelName || zipFile.name);
      } catch (err: any) {
        console.error("ZIP processing error:", err);
        setError(err?.message || "Failed to extract and load 3D model from ZIP file. Ensure it contains a valid .glb or .gltf file.");
      } finally {
        setIsProcessing(false);
      }
      return;
    }

    // Find the main 3D model file (.glb or .gltf)
    const mainFile = fileList.find(f => {
      const name = f.name.toLowerCase();
      return name.endsWith('.glb') || name.endsWith('.gltf');
    });

    if (!mainFile) {
      setError("Please choose a valid .glb, .gltf, or .zip archive file.");
      return;
    }

    try {
      // First, revoke any previous URLs to avoid memory leaks
      revokeAllUrls(fileMap);

      // Create a map of filename (lowercase) to its blob URL
      const newFileMap: { [key: string]: string } = {};
      fileList.forEach(f => {
        const url = URL.createObjectURL(f);
        newFileMap[f.name.toLowerCase()] = url;
      });

      const mainUrl = newFileMap[mainFile.name.toLowerCase()];

      setFileMap(newFileMap);
      setModelUrl(mainUrl);
      setModelName(mainFile.name);
    } catch (err) {
      console.error(err);
      setError("Failed to process the uploaded files.");
    }
  }, [fileMap]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(e.target.files);
    }
  };

  const handleClearModel = useCallback(() => {
    revokeAllUrls(fileMap);
    setFileMap({});
    setModelUrl(null);
    setModelName(null);
    setError(null);
    // Reset measurements and units
    setPoints([]);
    setHoveredPoint(null);
    setIsMeasuring(false);
    setModelMetadata(null);
    setSelectedUnit('m');
    setUnitFactor(1);
    setUnitLabel('m');
    setShowMetadata(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [fileMap]);

  const handleLoadError = useCallback((msg: string) => {
    setError(msg);
    handleClearModel();
  }, [handleClearModel]);

  const triggerFileSelect = () => {
    if (isProcessing) return;
    fileInputRef.current?.click();
  };

  // Clean up object URLs on unmount
  useEffect(() => {
    return () => {
      revokeAllUrls(fileMap);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div 
      className="w-full h-full absolute inset-0 bg-zinc-950 flex flex-col items-center justify-center overflow-hidden"
      onDrop={modelUrl || isProcessing ? undefined : handleDrop}
      onDragOver={modelUrl || isProcessing ? undefined : handleDragOver}
    >
      {/* 
        Hidden File Input
        We allow any files (and multiple selection) and validate in JS.
        This prevents iOS/Android from graying out .glb/.gltf/.bin files.
      */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        multiple
        accept=".glb,.gltf,.zip"
        className="hidden"
        id="model-file-upload-input"
      />

      {/* Upload Screen / Overlay */}
      {!modelUrl && (
        <div 
          onClick={triggerFileSelect}
          className="z-10 w-full max-w-lg mx-4 p-8 rounded-2xl border-2 border-dashed border-zinc-800 bg-zinc-900/40 backdrop-blur-md hover:border-zinc-500 hover:bg-zinc-900/60 transition-all duration-300 cursor-pointer text-center flex flex-col items-center justify-center gap-4 group animate-fade-in"
        >
          {isProcessing ? (
            <div className="p-4 bg-zinc-800/50 rounded-full text-zinc-100 animate-spin">
              <Loader2 className="w-8 h-8" />
            </div>
          ) : (
            <div className="p-4 bg-zinc-800/50 rounded-full group-hover:bg-zinc-800 group-hover:scale-110 transition-all duration-300 text-zinc-400 group-hover:text-white">
              <Upload className="w-8 h-8" />
            </div>
          )}
          
          <div className="space-y-2">
            <h2 className="text-xl font-medium text-zinc-100">
              {isProcessing ? "Processing Archive..." : "Upload 3D Model"}
            </h2>
            <p className="text-sm text-zinc-400 max-w-sm mx-auto leading-relaxed">
              {isProcessing ? (
                "Extracting your 3D assets and textures. Please wait..."
              ) : (
                <>
                  Drag & drop your files here, or tap to select from device.<br />
                  <span className="text-xs text-zinc-500 mt-2 block">
                    Supports <span className="text-zinc-300 font-mono">.zip</span> archives, self-contained <span className="text-zinc-300 font-mono">.glb</span>, or multi-file <span className="text-zinc-300 font-mono">.gltf</span> groups.
                  </span>
                </>
              )}
            </p>
          </div>

          {!isProcessing && (
            <span className="text-xs text-zinc-500 bg-zinc-800/30 px-3 py-1.5 rounded-full border border-zinc-800/50">
              Works perfectly on Desktop & Mobile
            </span>
          )}

          {error && (
            <div className="mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-2 max-w-md text-left">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>
      )}

      {/* Floating Header when model is loaded */}
      {modelUrl && (
        <div className="absolute top-4 left-4 right-4 z-10 flex items-center justify-between pointer-events-none">
          <div className="bg-zinc-900/85 backdrop-blur-md px-4 py-2 rounded-xl border border-zinc-800 flex items-center gap-2 max-w-xs md:max-w-md shadow-lg pointer-events-auto">
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse shrink-0" />
            <span className="text-xs font-mono text-zinc-300 truncate font-medium">
              {modelName || 'Loaded Model'}
            </span>
          </div>

          <button
            onClick={handleClearModel}
            className="p-2.5 bg-zinc-900/85 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-white rounded-xl transition shadow-lg pointer-events-auto flex items-center gap-1 text-xs font-medium"
            title="Load another model"
          >
            <X className="w-4 h-4" />
            <span className="hidden sm:inline">Close</span>
          </button>
        </div>
      )}

      {/* Floating Control Panel for measurements and metadata */}
      {modelUrl && (
        <div className="absolute bottom-6 left-4 right-4 sm:left-auto sm:right-6 sm:w-80 z-10 flex flex-col gap-3 pointer-events-none animate-fade-in">
          <div className="bg-zinc-900/90 backdrop-blur-md p-4 rounded-xl border border-zinc-800 shadow-2xl pointer-events-auto flex flex-col gap-3 animate-fade-in">
            {/* Header with toggle */}
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2.5">
              <div className="flex items-center gap-2">
                <Ruler className={`w-4 h-4 ${isMeasuring ? 'text-rose-500 animate-pulse' : 'text-zinc-400'}`} />
                <span className="text-sm font-medium text-zinc-200">Measure Distance</span>
              </div>
              <button
                onClick={() => {
                  setIsMeasuring(!isMeasuring);
                  if (isMeasuring) {
                    setPoints([]);
                    setHoveredPoint(null);
                  }
                }}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  isMeasuring ? 'bg-rose-600' : 'bg-zinc-800'
                }`}
                aria-label="Toggle measurement mode"
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    isMeasuring ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Display Unit Calibrator */}
            {isMeasuring && (
              <div className="space-y-1.5 border-b border-zinc-800 pb-3">
                <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">
                  <div className="flex items-center gap-1">
                    <Scale className="w-3 h-3 text-zinc-400" />
                    <span>Display Units</span>
                  </div>
                  {modelMetadata?.detectedUnit && (
                    <span className="text-rose-400 font-mono normal-case">
                      Detected: {modelMetadata.detectedUnit}
                    </span>
                  )}
                </div>
                <select
                  value={selectedUnit}
                  onChange={(e) => {
                    const val = e.target.value;
                    setSelectedUnit(val);
                    const options: { [key: string]: { factor: number; label: string } } = {
                      m: { factor: 1, label: 'm' },
                      cm: { factor: 100, label: 'cm' },
                      mm: { factor: 1000, label: 'mm' },
                      in: { factor: 39.3701, label: 'in' },
                      ft: { factor: 3.28084, label: 'ft' }
                    };
                    const opt = options[val];
                    if (opt) {
                      setUnitFactor(opt.factor);
                      setUnitLabel(opt.label);
                    }
                  }}
                  className="w-full bg-zinc-950 text-xs text-zinc-200 border border-zinc-800 focus:border-rose-500 focus:ring-1 focus:ring-rose-500 rounded-lg p-2 font-medium transition cursor-pointer"
                >
                  <option value="m">Meters (m)</option>
                  <option value="cm">Centimeters (cm)</option>
                  <option value="mm">Millimeters (mm)</option>
                  <option value="in">Inches (in)</option>
                  <option value="ft">Feet (ft)</option>
                </select>
              </div>
            )}

            {/* Content based on measurement mode */}
            {isMeasuring ? (
              <div className="space-y-3 text-xs text-zinc-400">
                {/* Visual state guide */}
                <div className="p-2.5 bg-rose-500/5 rounded-lg border border-rose-500/10 flex items-start gap-2 text-rose-200 leading-normal">
                  <Info className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
                  <span>
                    {points.length === 0 && "Click anywhere on the model to set the starting point."}
                    {points.length === 1 && "Move your cursor and click again to set the end point."}
                    {points.length === 2 && "Measurement complete! Click again to start a new measurement."}
                  </span>
                </div>

                {/* Readouts */}
                <div className="space-y-2 font-mono">
                  <div className="flex justify-between items-center bg-zinc-950/50 p-2 rounded border border-zinc-800/80">
                    <span className="text-zinc-500">Point A:</span>
                    <span className="text-zinc-300">
                      {points[0] 
                        ? `${(points[0].x * unitFactor).toFixed(2)}, ${(points[0].y * unitFactor).toFixed(2)}, ${(points[0].z * unitFactor).toFixed(2)}` 
                        : '—'
                      }
                    </span>
                  </div>
                  <div className="flex justify-between items-center bg-zinc-950/50 p-2 rounded border border-zinc-800/80">
                    <span className="text-zinc-500">Point B:</span>
                    <span className="text-zinc-300">
                      {points[1] 
                        ? `${(points[1].x * unitFactor).toFixed(2)}, ${(points[1].y * unitFactor).toFixed(2)}, ${(points[1].z * unitFactor).toFixed(2)}` 
                        : '—'
                      }
                    </span>
                  </div>
                </div>

                {/* Calculated distance and copy button */}
                {points.length === 2 && (
                  <div className="space-y-2 mt-3 pt-3 border-t border-zinc-800/80">
                    <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">Distance</div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xl font-mono font-bold text-rose-400">
                        {(points[0].distanceTo(points[1]) * unitFactor).toFixed(4)} <span className="text-xs font-normal text-zinc-500">{unitLabel}</span>
                      </div>
                      <button
                        onClick={() => {
                          const distStr = (points[0].distanceTo(points[1]) * unitFactor).toFixed(4);
                          navigator.clipboard.writeText(distStr);
                          setCopied(true);
                          setTimeout(() => setCopied(false), 2000);
                        }}
                        className="px-2.5 py-1.5 bg-zinc-950 hover:bg-zinc-850 border border-zinc-800 rounded-lg text-zinc-300 hover:text-white transition flex items-center gap-1.5 font-medium"
                        title="Copy to clipboard"
                      >
                        {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-zinc-400" />}
                        <span>{copied ? 'Copied!' : 'Copy'}</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Clear / Reset */}
                {points.length > 0 && (
                  <button
                    onClick={() => {
                      setPoints([]);
                      setHoveredPoint(null);
                    }}
                    className="w-full py-1.5 mt-1 bg-zinc-950 hover:bg-zinc-850 border border-zinc-800 hover:border-zinc-700 text-zinc-300 hover:text-white rounded-lg font-medium transition flex items-center justify-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-zinc-400" />
                    <span>Clear Measurement</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="text-xs text-zinc-500 flex flex-col items-center py-4 text-center gap-2">
                <MousePointerClick className="w-7 h-7 text-zinc-800 animate-pulse" />
                <span className="max-w-[220px]">
                  Toggle the switch above to enable point-to-point distance measurement.
                </span>
              </div>
            )}

            {/* Model Metadata Inspector Expandable panel */}
            {modelMetadata && (
              <div className="border-t border-zinc-800/80 pt-2.5 mt-1 text-xs">
                <button
                  onClick={() => setShowMetadata(!showMetadata)}
                  className="w-full flex items-center justify-between text-[10px] uppercase tracking-wider text-zinc-500 font-semibold hover:text-zinc-300 transition py-1"
                >
                  <div className="flex items-center gap-1.5">
                    <FileJson className="w-3.5 h-3.5" />
                    <span>File Metadata & Scale Info</span>
                  </div>
                  <span className="text-[10px] font-mono text-zinc-600">
                    {showMetadata ? '[ Hide ]' : '[ View ]'}
                  </span>
                </button>

                {showMetadata && (
                  <div className="mt-2.5 p-2.5 bg-zinc-950/60 rounded-lg border border-zinc-800/60 text-[11px] space-y-2 text-zinc-400 font-sans animate-fade-in leading-relaxed">
                    <div className="space-y-1">
                      <div className="flex justify-between border-b border-zinc-900 pb-1 text-[10px]">
                        <span className="text-zinc-500 font-mono">Exporter Tool:</span>
                        <span className="text-zinc-300 font-semibold text-right max-w-[150px] truncate" title={modelMetadata.generator}>
                          {modelMetadata.generator}
                        </span>
                      </div>
                      <div className="flex justify-between border-b border-zinc-900 pb-1 text-[10px]">
                        <span className="text-zinc-500 font-mono">Format Standard:</span>
                        <span className="text-zinc-300">glTF {modelMetadata.version} (Meters standard)</span>
                      </div>
                      {modelMetadata.dimensions && (
                        <div className="border-b border-zinc-900 pb-1.5 text-[10px]">
                          <span className="text-zinc-500 font-mono block mb-1">Bounding Box Bounds (3D Units):</span>
                          <div className="grid grid-cols-3 gap-1 text-center font-mono text-[9px] bg-zinc-950 p-1 rounded border border-zinc-900">
                            <div>
                              <span className="text-zinc-600 block text-[8px] uppercase">Width (X)</span>
                              <span className="text-zinc-300 font-semibold">{modelMetadata.dimensions.x.toFixed(2)}</span>
                            </div>
                            <div>
                              <span className="text-zinc-600 block text-[8px] uppercase">Height (Y)</span>
                              <span className="text-zinc-300 font-semibold">{modelMetadata.dimensions.y.toFixed(2)}</span>
                            </div>
                            <div>
                              <span className="text-zinc-600 block text-[8px] uppercase">Depth (Z)</span>
                              <span className="text-zinc-300 font-semibold">{modelMetadata.dimensions.z.toFixed(2)}</span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {modelMetadata.hasCalibrationAdvice && (
                      <div className="p-2 bg-rose-500/5 rounded border border-rose-500/10 text-[10px] text-rose-300 leading-normal">
                        <span className="font-semibold block mb-0.5 text-rose-400">Scale Recommendation:</span>
                        {modelMetadata.calibrationAdvice}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* React Three Fiber Canvas */}
      <Canvas 
        shadows 
        camera={{ position: [4, 4, 4], fov: 40 }}
        style={{ cursor: isMeasuring ? 'crosshair' : 'grab' }}
      >
        <color attach="background" args={['#09090b']} />
        <Suspense fallback={null}>
          {modelUrl && (
            <Stage environment="city" intensity={0.5}>
              <Model 
                url={modelUrl} 
                fileMap={fileMap} 
                onError={handleLoadError} 
                onLoaded={handleModelLoaded}
                onClick={handleModelClick}
                onPointerMove={handleModelPointerMove}
                onPointerOut={handleModelPointerOut}
              />
            </Stage>
          )}
        </Suspense>

        {/* Measurement Visualizations in World Space */}
        {modelUrl && isMeasuring && points.length > 0 && (
          <MeasurementLayer 
            points={points} 
            hoveredPoint={hoveredPoint} 
            modelSize={modelSize} 
            unitLabel={unitLabel}
            unitFactor={unitFactor}
          />
        )}

        <OrbitControls makeDefault />
      </Canvas>
    </div>
  );
}
