'use client';

import React, { useState, Suspense, useRef, useEffect, useCallback } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Stage } from '@react-three/drei';
import { Upload, X, AlertCircle, Loader2 } from 'lucide-react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import JSZip from 'jszip';

// Custom Model component using native GLTFLoader and LoadingManager to resolve separate textures and .bin files
function Model({ 
  url, 
  fileMap, 
  onError 
}: { 
  url: string; 
  fileMap: { [key: string]: string }; 
  onError: (msg: string) => void; 
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
  }, [url, fileMap, onError]);

  if (!gltf) return null;

  return <primitive object={gltf.scene} />;
}

export default function ThreeViewer() {
  const [modelUrl, setModelUrl] = useState<string | null>(null);
  const [modelName, setModelName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [fileMap, setFileMap] = useState<{ [key: string]: string }>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

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

      {/* React Three Fiber Canvas */}
      <Canvas shadows camera={{ position: [4, 4, 4], fov: 40 }}>
        <color attach="background" args={['#09090b']} />
        <Suspense fallback={null}>
          {modelUrl && (
            <Stage environment="city" intensity={0.5}>
              <Model url={modelUrl} fileMap={fileMap} onError={handleLoadError} />
            </Stage>
          )}
        </Suspense>
        <OrbitControls makeDefault />
      </Canvas>
    </div>
  );
}
