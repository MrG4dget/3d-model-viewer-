'use client';

import React, { useState, Suspense, useRef, useEffect, useCallback, useMemo } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Stage, Html, Line } from '@react-three/drei';
import { 
  Upload, X, AlertCircle, Loader2, Ruler, Info, Trash2, Copy, Check, 
  MousePointerClick, Scale, FileJson, Box, Settings2, Sliders,
  ChevronDown, ChevronUp, RotateCcw, Compass, Grid, Plus, Eye, EyeOff
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

// Saved measurement data structure
interface SavedMeasurement {
  id: string;
  name: string;
  pointA: THREE.Vector3;
  pointB: THREE.Vector3;
  color: string;
}

const COLORS = ["#38bdf8", "#10b981", "#a855f7", "#f97316", "#06b6d4", "#eab308"];

// Component to handle camera viewport resets and ground grid helper
function SceneHelpers({ 
  showGrid, 
  modelSize, 
  cameraView, 
  setCameraView 
}: { 
  showGrid: boolean; 
  modelSize: number; 
  cameraView: string | null; 
  setCameraView: (view: string | null) => void;
}) {
  const { camera } = useThree();
  const controls = useThree((state) => state.controls) as any;

  useEffect(() => {
    if (!cameraView) return;
    
    const dist = modelSize * 1.5 || 5;
    const target = controls?.target || new THREE.Vector3(0, 0, 0);

    if (cameraView === 'top') {
      camera.position.set(target.x, target.y + dist, target.z);
    } else if (cameraView === 'front') {
      camera.position.set(target.x, target.y, target.z + dist);
    } else if (cameraView === 'right') {
      camera.position.set(target.x + dist, target.y, target.z);
    } else if (cameraView === 'iso') {
      camera.position.set(target.x + dist * 0.7, target.y + dist * 0.7, target.z + dist * 0.7);
    }

    if (controls) {
      controls.update();
    }
    setCameraView(null);
  }, [cameraView, camera, controls, modelSize, setCameraView]);

  return (
    <>
      {showGrid && (
        <gridHelper 
          args={[modelSize * 6 || 30, 40, '#f43f5e', '#27272a']} 
          position={[0, -modelSize * 0.5 || -1, 0]} 
        />
      )}
    </>
  );
}

// Subcomponent to visualize measurements in 3D world space
function MeasurementLayer({
  savedMeasurements,
  activePoints,
  hoveredPoint,
  modelSize,
  unitLabel,
  unitFactor,
  customScale,
  activeMeasurementId,
  setActiveMeasurementId
}: {
  savedMeasurements: SavedMeasurement[];
  activePoints: THREE.Vector3[];
  hoveredPoint: THREE.Vector3 | null;
  modelSize: number;
  unitLabel: string;
  unitFactor: number;
  customScale: number;
  activeMeasurementId: string | null;
  setActiveMeasurementId: (id: string | null) => void;
}) {
  const sphereRadius = modelSize * 0.008; // Delicate size based on model bounds
  const activeColor = "#f43f5e"; // rose-500
  const previewColor = "#fda4af"; // rose-300

  return (
    <group>
      {/* Visualize Saved Measurements */}
      {savedMeasurements.map((m) => {
        const dist = m.pointA.distanceTo(m.pointB);
        const midpoint = new THREE.Vector3().addVectors(m.pointA, m.pointB).multiplyScalar(0.5);
        const isSelected = m.id === activeMeasurementId;
        const color = isSelected ? "#f43f5e" : m.color;

        return (
          <group key={m.id}>
            {/* Endpoints */}
            <mesh position={m.pointA} onClick={(e) => { e.stopPropagation(); setActiveMeasurementId(m.id); }}>
              <sphereGeometry args={[sphereRadius * (isSelected ? 1.3 : 1), 32, 32]} />
              <meshBasicMaterial color={color} depthTest={false} depthWrite={false} />
            </mesh>
            <mesh position={m.pointB} onClick={(e) => { e.stopPropagation(); setActiveMeasurementId(m.id); }}>
              <sphereGeometry args={[sphereRadius * (isSelected ? 1.3 : 1), 32, 32]} />
              <meshBasicMaterial color={color} depthTest={false} depthWrite={false} />
            </mesh>

            {/* Line */}
            <Line
              points={[m.pointA, m.pointB]}
              color={color}
              lineWidth={isSelected ? 3 : 1.5}
              depthTest={false}
              onClick={(e) => { e.stopPropagation(); setActiveMeasurementId(m.id); }}
            />

            {/* Distance Label */}
            <Html position={midpoint} center>
              <div 
                onClick={(e) => { e.stopPropagation(); setActiveMeasurementId(m.id); }}
                className={`cursor-pointer px-2 py-0.5 rounded-md shadow-lg text-[10px] font-mono whitespace-nowrap flex items-center gap-1.5 backdrop-blur-md transition-all border ${
                  isSelected 
                    ? "bg-rose-950/95 border-rose-500 text-rose-200 scale-105 font-bold" 
                    : "bg-zinc-950/85 border-zinc-800/80 text-zinc-300 hover:border-zinc-600 hover:bg-zinc-950/95"
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full shrink-0 animate-pulse" style={{ backgroundColor: color }} />
                <span>{m.name}: {(dist * customScale * unitFactor).toFixed(2)} {unitLabel}</span>
              </div>
            </Html>
          </group>
        );
      })}

      {/* Visualize current active point markers */}
      {activePoints.map((pt, idx) => (
        <mesh key={idx} position={pt}>
          <sphereGeometry args={[sphereRadius * 1.3, 32, 32]} />
          <meshBasicMaterial color={activeColor} depthTest={false} depthWrite={false} />
        </mesh>
      ))}

      {/* Visualize active measurement line */}
      {activePoints.length === 2 && (
        <>
          <Line
            points={[activePoints[0], activePoints[1]]}
            color={activeColor}
            lineWidth={3}
            depthTest={false}
          />
          {(() => {
            const dist = activePoints[0].distanceTo(activePoints[1]);
            const midpoint = new THREE.Vector3().addVectors(activePoints[0], activePoints[1]).multiplyScalar(0.5);
            return (
              <Html position={midpoint} center>
                <div className="bg-rose-950/95 border border-rose-500 text-rose-200 px-2.5 py-1 rounded-lg shadow-2xl text-xs font-mono whitespace-nowrap flex items-center gap-1.5 backdrop-blur-md pointer-events-none select-none font-bold animate-fade-in">
                  <span className="w-1.5 h-1.5 bg-rose-500 rounded-full shrink-0 animate-ping" />
                  <span>{(dist * customScale * unitFactor).toFixed(3)} {unitLabel}</span>
                </div>
              </Html>
            );
          })()}
        </>
      )}

      {/* Trailing guide line */}
      {activePoints.length === 1 && hoveredPoint && (
        <>
          <Line
            points={[activePoints[0], hoveredPoint]}
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

  // New multi-measurement, calibration and viewport states
  const [savedMeasurements, setSavedMeasurements] = useState<SavedMeasurement[]>([]);
  const [activeMeasurementId, setActiveMeasurementId] = useState<string | null>(null);
  const [customScale, setCustomScale] = useState<number>(1.0);
  const [calibrationInput, setCalibrationInput] = useState<string>('');
  
  const [showGrid, setShowGrid] = useState<boolean>(false);
  const [cameraView, setCameraView] = useState<string | null>(null);
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);
  const [adjustCamera, setAdjustCamera] = useState<boolean>(true);

  const controlsRef = useRef<any>(null);
  const cameraTimerRef = useRef<NodeJS.Timeout | null>(null);

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

    // Lock camera after Allowing Stage to auto-fit on load
    setAdjustCamera(true);
    if (cameraTimerRef.current) clearTimeout(cameraTimerRef.current);
    cameraTimerRef.current = setTimeout(() => {
      setAdjustCamera(false);
    }, 1000);

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
        const next = [...prev, clickedPoint];
        if (next.length === 2) {
          const newMeasurement: SavedMeasurement = {
            id: Math.random().toString(36).substring(2, 9),
            name: `Measurement ${savedMeasurements.length + 1}`,
            pointA: next[0],
            pointB: next[1],
            color: COLORS[savedMeasurements.length % COLORS.length]
          };
          setSavedMeasurements(prevSaved => [...prevSaved, newMeasurement]);
          setActiveMeasurementId(newMeasurement.id);
        }
        return next;
      }
    });
  }, [isMeasuring, savedMeasurements.length]);

  const handleModelPointerMove = useCallback((e: any) => {
    if (!isMeasuring || points.length !== 1) return;
    e.stopPropagation();
    setHoveredPoint(e.point.clone());
  }, [isMeasuring, points.length]);

  const handleModelPointerOut = useCallback(() => {
    if (!isMeasuring) return;
    setHoveredPoint(null);
  }, [isMeasuring]);

  const handleRenameMeasurement = useCallback((id: string, newName: string) => {
    setSavedMeasurements(prev => prev.map(m => m.id === id ? { ...m, name: newName } : m));
  }, []);

  const handleDeleteMeasurement = useCallback((id: string) => {
    setSavedMeasurements(prev => prev.filter(m => m.id !== id));
    if (activeMeasurementId === id) {
      setActiveMeasurementId(null);
    }
  }, [activeMeasurementId]);

  const handleCopyDistance = useCallback((dist: number) => {
    const distStr = (dist * customScale * unitFactor).toFixed(4);
    navigator.clipboard.writeText(distStr);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [customScale, unitFactor]);

  const handleCalibrate = useCallback(() => {
    const selected = savedMeasurements.find(m => m.id === activeMeasurementId);
    if (!selected) return;
    const value = parseFloat(calibrationInput);
    if (isNaN(value) || value <= 0) return;
    
    const rawDistance = selected.pointA.distanceTo(selected.pointB);
    const newCustomScale = value / (rawDistance * unitFactor);
    setCustomScale(newCustomScale);
    setCalibrationInput('');
  }, [activeMeasurementId, savedMeasurements, calibrationInput, unitFactor]);

  const handleResetCalibration = useCallback(() => {
    setCustomScale(1.0);
  }, []);

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

    setAdjustCamera(true);
    if (cameraTimerRef.current) clearTimeout(cameraTimerRef.current);

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

    const mainFile = fileList.find(f => {
      const name = f.name.toLowerCase();
      return name.endsWith('.glb') || name.endsWith('.gltf');
    });

    if (!mainFile) {
      setError("Please choose a valid .glb, .gltf, or .zip archive file.");
      return;
    }

    try {
      revokeAllUrls(fileMap);

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
    setSavedMeasurements([]);
    setActiveMeasurementId(null);
    setCustomScale(1.0);
    setCalibrationInput('');
    setShowGrid(false);
    setCameraView(null);
    setIsCollapsed(false);
    setAdjustCamera(true);
    if (cameraTimerRef.current) clearTimeout(cameraTimerRef.current);
    
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

  useEffect(() => {
    return () => {
      revokeAllUrls(fileMap);
      if (cameraTimerRef.current) clearTimeout(cameraTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div 
      className="w-full h-full absolute inset-0 bg-zinc-950 flex flex-col items-center justify-center overflow-hidden"
      onDrop={modelUrl || isProcessing ? undefined : handleDrop}
      onDragOver={modelUrl || isProcessing ? undefined : handleDragOver}
    >
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
          className="z-10 w-full max-w-lg mx-4 p-8 rounded-2xl border-2 border-dashed border-zinc-800 bg-zinc-900/40 backdrop-blur-md hover:border-zinc-500 hover:bg-zinc-900/60 transition-all duration-300 cursor-pointer text-center flex flex-col items-center justify-center gap-4 group animate-fade-in animate-duration-300"
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

      {/* Sleek Viewport CAD Toolbar (Compass, Presets, Grid) */}
      {modelUrl && (
        <div className="absolute top-[72px] left-4 z-10 pointer-events-none flex gap-2 animate-fade-in animate-duration-300">
          <div className="bg-zinc-900/90 backdrop-blur-md px-2.5 py-1.5 rounded-xl border border-zinc-800 shadow-xl flex items-center gap-2 pointer-events-auto">
            <button
              onClick={() => setShowGrid(!showGrid)}
              className={`p-1.5 rounded-lg transition-all flex items-center gap-1.5 text-xs font-semibold ${
                showGrid 
                  ? "bg-rose-500/15 border border-rose-500/30 text-rose-300" 
                  : "hover:bg-zinc-800 text-zinc-400 hover:text-white border border-transparent"
              }`}
              title="Toggle Ground Grid"
            >
              <Grid className="w-3.5 h-3.5" />
              <span className="hidden sm:inline text-[11px]">Grid</span>
            </button>
            
            <div className="w-[1px] h-4 bg-zinc-800 mx-1" />
            
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-zinc-500 uppercase font-bold px-1.5 select-none flex items-center gap-1">
                <Compass className="w-3.5 h-3.5 text-zinc-400" />
                <span className="hidden sm:inline">Views</span>
              </span>
              <button
                onClick={() => setCameraView('top')}
                className="px-2 py-1 hover:bg-zinc-800 text-zinc-400 hover:text-white rounded text-xs font-mono font-medium transition"
                title="Top View"
              >
                Top
              </button>
              <button
                onClick={() => setCameraView('front')}
                className="px-2 py-1 hover:bg-zinc-800 text-zinc-400 hover:text-white rounded text-xs font-mono font-medium transition"
                title="Front View"
              >
                Front
              </button>
              <button
                onClick={() => setCameraView('right')}
                className="px-2 py-1 hover:bg-zinc-800 text-zinc-400 hover:text-white rounded text-xs font-mono font-medium transition"
                title="Right View"
              >
                Right
              </button>
              <button
                onClick={() => setCameraView('iso')}
                className="px-2 py-1 hover:bg-zinc-800 text-zinc-400 hover:text-white rounded text-xs font-mono font-medium transition"
                title="Isometric View"
              >
                Iso
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Control Panel for measurements and metadata */}
      {modelUrl && (
        <div className="absolute bottom-6 right-6 w-80 z-10 flex flex-col gap-3 pointer-events-none animate-fade-in animate-duration-300">
          {isCollapsed ? (
            /* Collapsed State - Minimal Screenspace */
            <div className="bg-zinc-900/95 backdrop-blur-md px-3 py-2 rounded-xl border border-zinc-800 shadow-2xl pointer-events-auto flex items-center justify-between gap-3 animate-fade-in w-64 ml-auto">
              <div className="flex items-center gap-2 min-w-0">
                <Ruler className="w-4 h-4 text-rose-500 animate-pulse shrink-0" />
                <span className="text-xs font-semibold text-zinc-300 truncate">
                  Measuring ({savedMeasurements.length})
                </span>
              </div>
              <button
                onClick={() => setIsCollapsed(false)}
                className="p-1 hover:bg-zinc-850 rounded-md text-zinc-400 hover:text-white transition-all"
                title="Expand Panel"
              >
                <ChevronUp className="w-4 h-4" />
              </button>
            </div>
          ) : (
            /* Expanded Sleek / Compact Panel */
            <div className="bg-zinc-900/95 backdrop-blur-md p-3.5 rounded-xl border border-zinc-800 shadow-2xl pointer-events-auto flex flex-col gap-3 animate-fade-in max-h-[75vh] overflow-y-auto">
              {/* Header with Toggle */}
              <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2">
                <div className="flex items-center gap-2">
                  <Ruler className={`w-4 h-4 ${isMeasuring ? 'text-rose-500 animate-pulse' : 'text-zinc-400'}`} />
                  <span className="text-xs font-bold text-zinc-200 uppercase tracking-wider">Measuring Tools</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setIsCollapsed(true)}
                    className="p-1 hover:bg-zinc-850 rounded text-zinc-500 hover:text-zinc-300 transition"
                    title="Collapse Panel"
                  >
                    <ChevronDown className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => {
                      setIsMeasuring(!isMeasuring);
                      if (isMeasuring) {
                        setPoints([]);
                        setHoveredPoint(null);
                      }
                    }}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      isMeasuring ? 'bg-rose-600' : 'bg-zinc-850'
                    }`}
                    aria-label="Toggle measurement mode"
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        isMeasuring ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* Dynamic Compact Guide & Coordinate Readouts */}
              {isMeasuring && (
                <div className="space-y-2">
                  <p className="text-[10px] text-rose-300/90 leading-relaxed bg-rose-500/5 px-2 py-1.5 rounded-lg border border-rose-500/10 font-medium">
                    {points.length === 0 && "Click on the model to set the starting point."}
                    {points.length === 1 && "Move your cursor and click to set the endpoint."}
                    {points.length === 2 && "Measurement complete! It was saved below."}
                  </p>

                  <div className="grid grid-cols-2 gap-1.5 text-[9px] font-mono bg-zinc-950/60 p-2 rounded-lg border border-zinc-800/60">
                    <div>
                      <span className="text-zinc-500 block font-bold uppercase mb-0.5">Point A</span>
                      {points[0] ? (
                        <span className="text-zinc-300 font-semibold block truncate">
                          {`${(points[0].x * customScale * unitFactor).toFixed(2)}, ${(points[0].y * customScale * unitFactor).toFixed(2)}, ${(points[0].z * customScale * unitFactor).toFixed(2)}`}
                        </span>
                      ) : (
                        <span className="text-zinc-650 block">—</span>
                      )}
                    </div>
                    <div>
                      <span className="text-zinc-500 block font-bold uppercase mb-0.5">Point B</span>
                      {points[1] ? (
                        <span className="text-zinc-300 font-semibold block truncate">
                          {`${(points[1].x * customScale * unitFactor).toFixed(2)}, ${(points[1].y * customScale * unitFactor).toFixed(2)}, ${(points[1].z * customScale * unitFactor).toFixed(2)}`}
                        </span>
                      ) : (
                        <span className="text-zinc-650 block">—</span>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Calibration & Unit Configurations */}
              {isMeasuring && (
                <div className="grid grid-cols-2 gap-2 border-b border-zinc-800/80 pb-2.5">
                  <div className="space-y-1">
                    <span className="text-[9px] uppercase tracking-wider text-zinc-500 font-bold block">Units</span>
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
                      className="w-full bg-zinc-950 text-xs text-zinc-200 border border-zinc-800 focus:border-rose-500 focus:ring-1 focus:ring-rose-500 rounded-md py-1 px-1.5 font-semibold transition cursor-pointer"
                    >
                      <option value="m">Meters (m)</option>
                      <option value="cm">Centimeters (cm)</option>
                      <option value="mm">Millimeters (mm)</option>
                      <option value="in">Inches (in)</option>
                      <option value="ft">Feet (ft)</option>
                    </select>
                  </div>
                  <div className="flex items-end">
                    {points.length > 0 && (
                      <button
                        onClick={() => {
                          setPoints([]);
                          setHoveredPoint(null);
                        }}
                        className="w-full py-1 bg-zinc-950 hover:bg-zinc-850 border border-zinc-800 hover:border-zinc-700 text-zinc-300 hover:text-white rounded-md text-xs font-semibold transition flex items-center justify-center gap-1"
                      >
                        <Trash2 className="w-3 h-3 text-zinc-500" />
                        <span>Reset Current</span>
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Saved Measurements History (Interactive List) */}
              {savedMeasurements.length > 0 && (
                <div className="space-y-2 border-b border-zinc-800/80 pb-2.5">
                  <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold flex items-center justify-between select-none">
                    <span>Saved History ({savedMeasurements.length})</span>
                    {customScale !== 1.0 && (
                      <span className="text-[9px] text-rose-455 font-mono font-bold lowercase">calibrated ({customScale.toFixed(2)}x)</span>
                    )}
                  </div>
                  <div className="space-y-1.5 max-h-36 overflow-y-auto pr-0.5 scrollbar-thin scrollbar-thumb-zinc-800">
                    {savedMeasurements.map((m) => {
                      const isSelected = m.id === activeMeasurementId;
                      const dist = m.pointA.distanceTo(m.pointB);
                      return (
                        <div 
                          key={m.id}
                          onClick={() => setActiveMeasurementId(m.id)}
                          className={`group/item p-1.5 rounded-lg border text-xs flex items-center justify-between gap-2 transition-all cursor-pointer ${
                            isSelected 
                              ? "bg-zinc-800/50 border-rose-500/50" 
                              : "bg-zinc-950/40 border-zinc-800/50 hover:bg-zinc-900/40"
                          }`}
                        >
                          <div className="flex items-center gap-1.5 min-w-0 flex-1">
                            <span className="w-2 h-2 rounded-full shrink-0 animate-pulse" style={{ backgroundColor: m.color }} />
                            <input
                              type="text"
                              value={m.name}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => handleRenameMeasurement(m.id, e.target.value)}
                              className="bg-transparent border-0 focus:bg-zinc-950 focus:ring-1 focus:ring-zinc-700 text-zinc-200 text-xs font-semibold focus:px-1 rounded w-full truncate py-0.5"
                            />
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="font-mono text-zinc-250 font-bold text-xs">
                              {(dist * customScale * unitFactor).toFixed(2)}<span className="text-[10px] text-zinc-500 font-normal ml-0.5">{unitLabel}</span>
                            </span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCopyDistance(dist);
                              }}
                              className="text-zinc-500 hover:text-zinc-200 p-1 rounded transition opacity-0 group-hover/item:opacity-100 focus:opacity-100"
                              title="Copy to clipboard"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteMeasurement(m.id);
                              }}
                              className="text-zinc-500 hover:text-red-400 p-1 rounded transition"
                              title="Delete"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Calibration Tools */}
              {activeMeasurementId && savedMeasurements.some(m => m.id === activeMeasurementId) && (
                <div className="bg-zinc-950/50 border border-zinc-800/80 p-2.5 rounded-lg space-y-2 animate-fade-in">
                  <div className="flex items-center justify-between select-none">
                    <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider">Scale Calibration</span>
                    <span className="text-[9px] text-zinc-500 font-mono">
                      Selected: {savedMeasurements.find(m => m.id === activeMeasurementId)?.name}
                    </span>
                  </div>
                  <p className="text-[10px] text-zinc-400 leading-relaxed">
                    Set a known physical dimension to calibrate absolute scale.
                  </p>
                  <div className="flex gap-1.5">
                    <input
                      type="number"
                      step="any"
                      placeholder={`True size (${unitLabel})`}
                      value={calibrationInput}
                      onChange={(e) => setCalibrationInput(e.target.value)}
                      className="flex-1 bg-zinc-950 border border-zinc-800 focus:border-rose-500 focus:ring-1 focus:ring-rose-500 rounded px-2 py-1 text-xs text-zinc-200 font-mono"
                    />
                    <button
                      onClick={handleCalibrate}
                      className="px-2.5 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded text-xs font-semibold transition shrink-0"
                    >
                      Calibrate
                    </button>
                  </div>
                  {customScale !== 1.0 && (
                    <button
                      onClick={handleResetCalibration}
                      className="text-[9px] text-rose-455 hover:text-rose-300 transition flex items-center gap-1 font-bold"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Reset Calibration ({customScale.toFixed(3)}x)
                    </button>
                  )}
                </div>
              )}

              {/* Static text prompt if measuring is disabled */}
              {!isMeasuring && savedMeasurements.length === 0 && (
                <div className="text-xs text-zinc-500 flex flex-col items-center py-4 text-center gap-2 select-none">
                  <MousePointerClick className="w-6 h-6 text-zinc-850 animate-pulse" />
                  <span className="max-w-[210px] leading-relaxed font-medium">
                    Toggle the switch above to enable point-to-point distance measurements.
                  </span>
                </div>
              )}

              {/* Model Metadata Inspector Expandable panel */}
              {modelMetadata && (
                <div className="border-t border-zinc-800/80 pt-2 text-xs">
                  <button
                    onClick={() => setShowMetadata(!showMetadata)}
                    className="w-full flex items-center justify-between text-[10px] uppercase tracking-wider text-zinc-500 font-semibold hover:text-zinc-300 transition py-0.5"
                  >
                    <div className="flex items-center gap-1.5">
                      <FileJson className="w-3.5 h-3.5 text-zinc-450" />
                      <span>File Metadata</span>
                    </div>
                    <span className="text-[9px] font-mono text-zinc-600">
                      {showMetadata ? '[ Hide ]' : '[ View ]'}
                    </span>
                  </button>

                  {showMetadata && (
                    <div className="mt-2 p-2 bg-zinc-950/60 rounded-lg border border-zinc-800/60 text-[10px] space-y-1.5 text-zinc-400 font-sans animate-fade-in leading-relaxed max-h-36 overflow-y-auto">
                      <div className="flex justify-between border-b border-zinc-900 pb-1">
                        <span className="text-zinc-500 font-mono">Exporter Tool:</span>
                        <span className="text-zinc-300 font-semibold text-right max-w-[150px] truncate" title={modelMetadata.generator}>
                          {modelMetadata.generator}
                        </span>
                      </div>
                      <div className="flex justify-between border-b border-zinc-900 pb-1">
                        <span className="text-zinc-500 font-mono">Format:</span>
                        <span className="text-zinc-300">glTF {modelMetadata.version}</span>
                      </div>
                      {modelMetadata.dimensions && (
                        <div className="space-y-1">
                          <span className="text-zinc-500 font-mono block">Bounding Box Bounds:</span>
                          <div className="grid grid-cols-3 gap-1 text-center font-mono text-[9px] bg-zinc-950 p-1 rounded border border-zinc-900">
                            <div>
                              <span className="text-zinc-650 block text-[8px] uppercase">Width (X)</span>
                              <span className="text-zinc-300 font-semibold">{(modelMetadata.dimensions.x * customScale).toFixed(2)}</span>
                            </div>
                            <div>
                              <span className="text-zinc-650 block text-[8px] uppercase">Height (Y)</span>
                              <span className="text-zinc-300 font-semibold">{(modelMetadata.dimensions.y * customScale).toFixed(2)}</span>
                            </div>
                            <div>
                              <span className="text-zinc-650 block text-[8px] uppercase">Depth (Z)</span>
                              <span className="text-zinc-300 font-semibold">{(modelMetadata.dimensions.z * customScale).toFixed(2)}</span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
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
            <Stage environment="city" intensity={0.5} adjustCamera={adjustCamera}>
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

        {/* Scene Helpers (Grid and Camera Viewports) */}
        {modelUrl && (
          <SceneHelpers 
            showGrid={showGrid} 
            modelSize={modelSize} 
            cameraView={cameraView} 
            setCameraView={setCameraView} 
          />
        )}

        {/* Measurement Visualizations in World Space */}
        {modelUrl && (isMeasuring || savedMeasurements.length > 0) && (
          <MeasurementLayer 
            savedMeasurements={savedMeasurements}
            activePoints={points}
            hoveredPoint={hoveredPoint}
            modelSize={modelSize}
            unitLabel={unitLabel}
            unitFactor={unitFactor}
            customScale={customScale}
            activeMeasurementId={activeMeasurementId}
            setActiveMeasurementId={setActiveMeasurementId}
          />
        )}

        <OrbitControls makeDefault ref={controlsRef} />
      </Canvas>
    </div>
  );
}
