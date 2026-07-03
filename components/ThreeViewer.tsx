'use client';

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { 
  Maximize2, RotateCcw, HelpCircle, Compass, Scaling, Type, Ruler, 
  Trash2, Plus, MessageSquare, Send, CheckCircle2, AlertCircle, Eye, EyeOff,
  Camera
} from 'lucide-react';
import { Annotation, Measurement, ModelMetadata } from '@/lib/storage';

interface ThreeViewerProps {
  id: string;
  metadata: ModelMetadata;
  initialAnnotations: Annotation[];
  initialMeasurements: Measurement[];
  role: 'admin' | 'reviewer';
  viewOnly: boolean;
  onUpdateMetadata?: (metadata: Partial<ModelMetadata>) => void;
  onSaveAnnotations?: (annotations: Annotation[]) => void;
  onSaveMeasurements?: (measurements: Measurement[]) => void;
}

export default function ThreeViewer({
  id,
  metadata,
  initialAnnotations,
  initialMeasurements,
  role,
  viewOnly,
  onUpdateMetadata,
  onSaveAnnotations,
  onSaveMeasurements
}: ThreeViewerProps) {
  // Container & Canvas references
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // Three.js instances
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const modelRef = useRef<THREE.Group | null>(null);
  const raycasterRef = useRef<THREE.Raycaster | null>(null);
  
  // UI & Tool States
  const [activeTool, setActiveTool] = useState<'orbit' | 'measure' | 'annotate'>('orbit');
  const [unit, setUnit] = useState<'m' | 'cm' | 'mm'>('m');
  const [showAnnotations, setShowAnnotations] = useState(true);
  const [showMeasurements, setShowMeasurements] = useState(true);
  const [showHelp, setShowHelp] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  // Model Loading states
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  
  // Dynamic projection coordinates state
  const [projectedAnnotations, setProjectedAnnotations] = useState<{ id: string; x: number; y: number; visible: boolean }[]>([]);
  const [projectedMeasurements, setProjectedMeasurements] = useState<{ id: string; x: number; y: number; label: string; visible: boolean }[]>([]);
  
  // Annotation & Measurement states
  const [annotations, setAnnotations] = useState<Annotation[]>(initialAnnotations);
  const [measurements, setMeasurements] = useState<Measurement[]>(initialMeasurements);
  const [selectedAnnotation, setSelectedAnnotation] = useState<Annotation | null>(null);
  
  // Multi-point measurement builder state (temporary clicked points)
  const [activeMeasurementPoints, setActiveMeasurementPoints] = useState<THREE.Vector3[]>([]);
  const [hoveredPoint, setHoveredPoint] = useState<THREE.Vector3 | null>(null);
  
  // Form states for creating/editing annotations
  const [isCreatingAnnotation, setIsCreatingAnnotation] = useState(false);
  const [tempAnnotationPos, setTempAnnotationPos] = useState<[number, number, number] | null>(null);
  const [newAnnotationForm, setNewAnnotationForm] = useState({
    title: '',
    comment: '',
    author: role === 'admin' ? 'Owner' : 'Guest Reviewer',
    status: 'Open' as 'Open' | 'Resolved' | 'Question'
  });
  const [newReplyText, setNewReplyText] = useState('');
  
  // Scale Calibration Modal state
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [calibrationPoint1, setCalibrationPoint1] = useState<THREE.Vector3 | null>(null);
  const [calibrationPoint2, setCalibrationPoint2] = useState<THREE.Vector3 | null>(null);
  const [calibrationRealValue, setCalibrationRealValue] = useState('1.0');

  // Thumbnail generation states
  const [savingThumbnail, setSavingThumbnail] = useState(false);
  const [saveThumbnailSuccess, setSaveThumbnailSuccess] = useState(false);

  const captureThumbnailDataUrl = (): string | null => {
    if (!rendererRef.current) return null;
    try {
      return rendererRef.current.domElement.toDataURL('image/png');
    } catch (e) {
      console.error('Error capturing canvas data', e);
      return null;
    }
  };

  const saveThumbnail = async (dataUrl: string) => {
    try {
      const res = await fetch(`/api/models/${id}/thumbnail`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: dataUrl }),
      });
      if (res.ok) {
        if (onUpdateMetadata) {
          onUpdateMetadata({ hasThumbnail: true });
        }
        return true;
      }
    } catch (e) {
      console.error('Failed to save thumbnail', e);
    }
    return false;
  };

  const autoCaptureThumbnail = async () => {
    const dataUrl = captureThumbnailDataUrl();
    if (dataUrl) {
      await saveThumbnail(dataUrl);
    }
  };

  const handleSaveViewAsThumbnail = async () => {
    setSavingThumbnail(true);
    setSaveThumbnailSuccess(false);
    const dataUrl = captureThumbnailDataUrl();
    if (dataUrl) {
      const success = await saveThumbnail(dataUrl);
      if (success) {
        setSaveThumbnailSuccess(true);
        setTimeout(() => setSaveThumbnailSuccess(false), 3000);
      }
    }
    setSavingThumbnail(false);
  };

  // Auto-generate thumbnail if not present
  useEffect(() => {
    if (isLoaded && !metadata.hasThumbnail) {
      const timer = setTimeout(() => {
        autoCaptureThumbnail();
      }, 1500); // 1.5 seconds delay to let textures fully render and load
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, metadata.hasThumbnail]);

  // Convert distance based on scaleRatio and selected unit
  const formatDistance = (rawDistanceInMeters: number) => {
    const calibratedMeters = rawDistanceInMeters * (metadata.scaleRatio || 1.0);
    switch (unit) {
      case 'cm':
        return `${(calibratedMeters * 100).toFixed(1)} cm`;
      case 'mm':
        return `${(calibratedMeters * 1000).toFixed(1)} mm`;
      case 'm':
      default:
        return `${calibratedMeters.toFixed(3)} m`;
    }
  };

  // Synchronize internal state with changes from outside
  useEffect(() => {
    const timer = setTimeout(() => {
      setAnnotations(initialAnnotations);
    }, 0);
    return () => clearTimeout(timer);
  }, [initialAnnotations]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setMeasurements(initialMeasurements);
    }, 0);
    return () => clearTimeout(timer);
  }, [initialMeasurements]);

  // Update projected HTML overlay elements
  const updateProjectedCoordinates = () => {
    if (!cameraRef.current || !canvasRef.current || !containerRef.current) return;
    const camera = cameraRef.current;
    const canvas = canvasRef.current;
    
    const rect = canvas.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;

    // Projection helper
    const project = (v: THREE.Vector3) => {
      const p = v.clone().project(camera);
      return {
        x: (p.x * 0.5 + 0.5) * width,
        y: (-p.y * 0.5 + 0.5) * height,
        visible: p.z <= 1.0 && p.x >= -1.0 && p.x <= 1.0 && p.y >= -1.0 && p.y <= 1.0
      };
    };

    // Project Annotations
    if (showAnnotations) {
      const projected = annotations.map(anno => {
        const v = new THREE.Vector3(...anno.position);
        const coords = project(v);
        return {
          id: anno.id,
          x: coords.x,
          y: coords.y,
          visible: coords.visible
        };
      });
      setProjectedAnnotations(projected);
    } else {
      setProjectedAnnotations([]);
    }

    // Project Measurements
    if (showMeasurements) {
      const projected = measurements.map(m => {
        if (m.points.length < 2) return null;
        
        // Find midpoint of all points to display the measurement label
        const sumVec = new THREE.Vector3();
        m.points.forEach(pt => {
          sumVec.add(new THREE.Vector3(...pt));
        });
        const midPoint = sumVec.divideScalar(m.points.length);
        const coords = project(midPoint);
        
        return {
          id: m.id,
          x: coords.x,
          y: coords.y,
          label: m.name ? `${m.name}: ${formatDistance(m.distance)}` : formatDistance(m.distance),
          visible: coords.visible
        };
      }).filter(Boolean) as any[];
      
      setProjectedMeasurements(projected);
    } else {
      setProjectedMeasurements([]);
    }
  };

  // Re-project on change of view state, measurements, annotations, or units
  useEffect(() => {
    updateProjectedCoordinates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [annotations, measurements, showAnnotations, showMeasurements, unit, isLoaded]);

  // Handle Fullscreen toggle
  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(err => {
        console.error('Error enabling fullscreen', err);
      });
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false));
    }
  };

  // Monitor fullscreen change events (e.g. Esc key pressed)
  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  // Initialize Three.js Scene, Camera, Lights, and Controls
  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf1f5f9); // soft off-white slate-100
    sceneRef.current = scene;

    // Grid helper
    const gridHelper = new THREE.GridHelper(50, 50, 0x94a3b8, 0xe2e8f0);
    gridHelper.position.y = -0.01;
    scene.add(gridHelper);

    // Axes helper
    const axesHelper = new THREE.AxesHelper(3);
    scene.add(axesHelper);

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight1.position.set(10, 20, 15);
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.4);
    dirLight2.position.set(-10, 10, -15);
    scene.add(dirLight2);

    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.5);
    hemiLight.position.set(0, 20, 0);
    scene.add(hemiLight);

    // Camera
    const rect = canvasRef.current.getBoundingClientRect();
    const camera = new THREE.PerspectiveCamera(45, rect.width / rect.height, 0.1, 1000);
    camera.position.set(5, 5, 8);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({
      canvas: canvasRef.current,
      antialias: true,
      preserveDrawingBuffer: true // Required for taking screenshot
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(rect.width, rect.height);
    rendererRef.current = renderer;

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2 + 0.1; // Don't orbit below ground much
    controlsRef.current = controls;

    // Coordinate re-projection listener
    controls.addEventListener('change', updateProjectedCoordinates);

    // Raycaster
    const raycaster = new THREE.Raycaster();
    raycasterRef.current = raycaster;

    // Resize Observer
    const resizeObserver = new ResizeObserver(entries => {
      if (!entries || entries.length === 0) return;
      const entry = entries[0];
      const { width, height } = entry.contentRect;

      if (cameraRef.current && rendererRef.current) {
        cameraRef.current.aspect = width / height;
        cameraRef.current.updateProjectionMatrix();
        rendererRef.current.setSize(width, height);
        updateProjectedCoordinates();
      }
    });
    resizeObserver.observe(containerRef.current);

    // Load Model File
    const loader = new GLTFLoader();
    const modelUrl = `/api/models/${id}/files/${metadata.modelPath}`;

    loader.load(
      modelUrl,
      (gltf) => {
        const loadedModel = gltf.scene;
        scene.add(loadedModel);
        modelRef.current = loadedModel;

        // Auto-center and fit model to view
        const box = new THREE.Box3().setFromObject(loadedModel);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        
        // Offset model so its bottom sits on the ground grid
        loadedModel.position.x += -center.x;
        loadedModel.position.y += -box.min.y;
        loadedModel.position.z += -center.z;

        // Position camera to fit the bounding box
        const maxDim = Math.max(size.x, size.y, size.z);
        const fov = camera.fov * (Math.PI / 180);
        let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
        cameraZ *= 1.8; // buffer factor

        camera.position.set(cameraZ * 0.7, cameraZ * 0.7, cameraZ * 0.7);
        camera.lookAt(0, size.y / 2, 0);
        controls.target.set(0, size.y / 2, 0);
        controls.update();

        setIsLoaded(true);
        updateProjectedCoordinates();
      },
      (xhr) => {
        if (xhr.total > 0) {
          setLoadingProgress(Math.round((xhr.loaded / xhr.total) * 100));
        } else {
          setLoadingProgress(50); // fallback mock progress
        }
      },
      (error) => {
        console.error('Error loading GLB model:', error);
        setLoadingError('The model loaded, but one or more textures are missing, or the format is invalid.');
        if (onUpdateMetadata) {
          onUpdateMetadata({ loadingStatus: 'Failed' });
        }
      }
    );

    // Animation Loop
    let animationFrameId: number;
    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      if (controlsRef.current) controlsRef.current.update();
      if (rendererRef.current && sceneRef.current && cameraRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      }
    };
    animate();

    // Clean up
    return () => {
      cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
      if (controlsRef.current) {
        controlsRef.current.removeEventListener('change', updateProjectedCoordinates);
        controlsRef.current.dispose();
      }
      if (rendererRef.current) rendererRef.current.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, metadata.modelPath]);

  // Handle click on canvas for placement or measurements
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isLoaded || !canvasRef.current || !cameraRef.current || !sceneRef.current || !raycasterRef.current || !modelRef.current) return;

    // Calculate mouse position in normalized device coordinates
    const rect = canvasRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    raycasterRef.current.setFromCamera(new THREE.Vector2(x, y), cameraRef.current);

    // Intersect with model hierarchy
    const intersects = raycasterRef.current.intersectObject(modelRef.current, true);

    if (intersects.length > 0) {
      const point = intersects[0].point;

      // --- MEASURE TOOL WORKFLOW ---
      if (activeTool === 'measure') {
        if (viewOnly && !metadata.shareSettings.guestsCanMeasure) return;

        const newPoints = [...activeMeasurementPoints, point];
        setActiveMeasurementPoints(newPoints);

        // If calibrating, capture references
        if (isCalibrating) {
          if (!calibrationPoint1) {
            setCalibrationPoint1(point);
          } else if (!calibrationPoint2) {
            setCalibrationPoint2(point);
            // Show calculated raw distance
            const rawDist = calibrationPoint1.distanceTo(point);
            setCalibrationRealValue(rawDist.toFixed(3));
          }
        }

        // If we finished a point-to-point or multi-point path segment
        // In our visual helper, we draw connections dynamically. Let's add them to the official list if the user double-clicks or just completes an segment
        // Let's do instant point-to-point for standard clicks. If we click second point, save measurement automatically.
        if (newPoints.length === 2 && !isCalibrating) {
          const rawDistance = newPoints[0].distanceTo(newPoints[1]);
          const newMeasurement: Measurement = {
            id: Math.random().toString(36).substring(2, 9),
            name: `Measurement ${measurements.length + 1}`,
            points: [
              [newPoints[0].x, newPoints[0].y, newPoints[0].z],
              [newPoints[1].x, newPoints[1].y, newPoints[1].z]
            ],
            distance: rawDistance
          };

          const updatedList = [...measurements, newMeasurement];
          setMeasurements(updatedList);
          setActiveMeasurementPoints([]); // reset build list
          if (onSaveMeasurements) onSaveMeasurements(updatedList);
        }
      } 
      // --- ANNOTATION TOOL WORKFLOW ---
      else if (activeTool === 'annotate') {
        if (viewOnly && !metadata.shareSettings.guestsCanAnnotate) return;

        setTempAnnotationPos([point.x, point.y, point.z]);
        setIsCreatingAnnotation(true);
        setNewAnnotationForm(prev => ({
          ...prev,
          title: `Note ${annotations.length + 1}`,
          comment: ''
        }));
      }
    }
  };

  // Live mouse hover coordinate tracker for measurements
  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (activeTool !== 'measure' || activeMeasurementPoints.length === 0 || !canvasRef.current || !cameraRef.current || !modelRef.current || !raycasterRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    raycasterRef.current.setFromCamera(new THREE.Vector2(x, y), cameraRef.current);
    const intersects = raycasterRef.current.intersectObject(modelRef.current, true);

    if (intersects.length > 0) {
      setHoveredPoint(intersects[0].point);
    } else {
      setHoveredPoint(null);
    }
    updateProjectedCoordinates();
  };

  // Cancel building measurement
  const cancelActiveMeasurement = () => {
    setActiveMeasurementPoints([]);
    setHoveredPoint(null);
  };

  // Delete measurement
  const handleDeleteMeasurement = (mId: string) => {
    const updated = measurements.filter(m => m.id !== mId);
    setMeasurements(updated);
    if (onSaveMeasurements) onSaveMeasurements(updated);
  };

  // Submit Annotation Form
  const handleSaveAnnotation = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tempAnnotationPos) return;

    const newAnno: Annotation = {
      id: Math.random().toString(36).substring(2, 9),
      title: newAnnotationForm.title || `Annotation ${annotations.length + 1}`,
      comment: newAnnotationForm.comment,
      author: newAnnotationForm.author || (role === 'admin' ? 'Owner' : 'Guest'),
      date: new Date().toLocaleDateString('en-US', { hour: '2-digit', minute: '2-digit' }),
      status: newAnnotationForm.status,
      position: tempAnnotationPos,
      replies: []
    };

    const updated = [...annotations, newAnno];
    setAnnotations(updated);
    setIsCreatingAnnotation(false);
    setTempAnnotationPos(null);
    setSelectedAnnotation(newAnno);
    
    if (onSaveAnnotations) onSaveAnnotations(updated);
  };

  // Delete annotation
  const handleDeleteAnnotation = (aId: string) => {
    const updated = annotations.filter(a => a.id !== aId);
    setAnnotations(updated);
    setSelectedAnnotation(null);
    if (onSaveAnnotations) onSaveAnnotations(updated);
  };

  // Submit reply to annotation
  const handleSaveReply = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAnnotation || !newReplyText.trim()) return;

    const reply = {
      id: Math.random().toString(36).substring(2, 9),
      author: role === 'admin' ? 'Owner' : 'Guest Reviewer',
      comment: newReplyText,
      date: new Date().toLocaleDateString('en-US', { hour: '2-digit', minute: '2-digit' })
    };

    const updated = annotations.map(anno => {
      if (anno.id === selectedAnnotation.id) {
        return {
          ...anno,
          replies: [...anno.replies, reply]
        };
      }
      return anno;
    });

    setAnnotations(updated);
    setNewReplyText('');
    
    // Refresh selected annotation representation
    const freshSelected = updated.find(a => a.id === selectedAnnotation.id) || null;
    setSelectedAnnotation(freshSelected);

    if (onSaveAnnotations) onSaveAnnotations(updated);
  };

  // Jump camera to annotation point
  const jumpCameraToAnnotation = (anno: Annotation) => {
    if (!cameraRef.current || !controlsRef.current) return;
    const annoPos = new THREE.Vector3(...anno.position);
    
    // Position camera slightly offset from the target point
    const offset = new THREE.Vector3(1.5, 1.5, 1.5);
    const cameraTargetPos = annoPos.clone().add(offset);

    // Animate camera/controls transition (simplified instant jump or smooth increment)
    cameraRef.current.position.copy(cameraTargetPos);
    controlsRef.current.target.copy(annoPos);
    controlsRef.current.update();
    
    setSelectedAnnotation(anno);
    updateProjectedCoordinates();
  };

  // Reset viewport view
  const handleResetView = () => {
    if (!controlsRef.current || !cameraRef.current || !sceneRef.current || !modelRef.current) return;
    const box = new THREE.Box3().setFromObject(modelRef.current);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());

    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = cameraRef.current.fov * (Math.PI / 180);
    let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
    cameraZ *= 1.8;

    cameraRef.current.position.set(cameraZ * 0.7, cameraZ * 0.7, cameraZ * 0.7);
    controlsRef.current.target.set(0, size.y / 2, 0);
    controlsRef.current.update();
    updateProjectedCoordinates();
  };

  // Handle Scale Calibration submission
  const handleCalibrateScaleSubmit = () => {
    if (!calibrationPoint1 || !calibrationPoint2) return;
    const rawDistance = calibrationPoint1.distanceTo(calibrationPoint2);
    const realDistance = parseFloat(calibrationRealValue);

    if (isNaN(realDistance) || realDistance <= 0) {
      alert('Please enter a valid positive numeric distance.');
      return;
    }

    const calculatedRatio = realDistance / rawDistance;

    if (onUpdateMetadata) {
      onUpdateMetadata({
        scaleStatus: 'calibrated',
        scaleRatio: calculatedRatio,
        referenceDistanceValue: realDistance,
        referenceDistancePoints: [
          [calibrationPoint1.x, calibrationPoint1.y, calibrationPoint1.z],
          [calibrationPoint2.x, calibrationPoint2.y, calibrationPoint2.z]
        ]
      });
    }

    // Reset calibration builder states
    setCalibrationPoint1(null);
    setCalibrationPoint2(null);
    setIsCalibrating(false);
    setActiveTool('orbit');
    cancelActiveMeasurement();
  };

  // Take screenshot of Three.js canvas
  const handleTakeScreenshot = () => {
    if (!rendererRef.current) return;
    try {
      const dataUrl = rendererRef.current.domElement.toDataURL('image/jpeg', 0.9);
      const link = document.createElement('a');
      link.download = `${metadata.name}-screenshot.jpg`;
      link.href = dataUrl;
      link.click();
    } catch (e) {
      console.error('Error generating screenshot', e);
    }
  };

  // Generate simple text report/export
  const handleExportReport = () => {
    let report = `=========================================\n`;
    report += `3D MODEL REIEW REPORT: ${metadata.name}\n`;
    report += `=========================================\n`;
    report += `Date generated: ${new Date().toLocaleDateString()}\n`;
    report += `File: ${metadata.fileName}\n`;
    report += `Scale status: ${metadata.scaleStatus.toUpperCase()} (multiplier: ${metadata.scaleRatio || 1.0})\n`;
    report += `Total Annotations: ${annotations.length}\n`;
    report += `Total Measurements: ${measurements.length}\n\n`;

    report += `--- MEASUREMENTS ---\n`;
    measurements.forEach((m, idx) => {
      report += `${idx + 1}. ${m.name || 'Measurement'}: ${formatDistance(m.distance)}\n`;
    });
    report += `\n`;

    report += `--- ANNOTATIONS & FEEDBACK ---\n`;
    annotations.forEach((a, idx) => {
      report += `[${a.status}] ${idx + 1}. "${a.title}" by ${a.author} on ${a.date}\n`;
      report += `Comment: "${a.comment}"\n`;
      if (a.replies && a.replies.length > 0) {
        a.replies.forEach(r => {
          report += `  -> Reply by ${r.author} on ${r.date}: "${r.comment}"\n`;
        });
      }
      report += `\n`;
    });

    const blob = new Blob([report], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${metadata.name}-review-report.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div 
      id="three-viewer-container"
      ref={containerRef} 
      className="relative w-full h-[600px] bg-slate-900 overflow-hidden flex flex-col md:flex-row border border-slate-200 rounded-2xl shadow-xl font-sans"
    >
      {/* Dynamic Floating Tooltips: Projected Measurements Overlay */}
      {showMeasurements && projectedMeasurements.map(m => (
        <div 
          key={m.id}
          id={`measure-overlay-${m.id}`}
          style={{ 
            left: `${m.x}px`, 
            top: `${m.y}px`, 
            transform: 'translate(-50%, -100%)' 
          }}
          className={`absolute pointer-events-auto bg-emerald-600/95 backdrop-blur text-white text-xs px-2 py-1 rounded shadow-md font-mono border border-emerald-400 select-none z-10 whitespace-nowrap transition-all duration-75 ${m.visible ? 'opacity-100 scale-100' : 'opacity-0 scale-50 pointer-events-none'}`}
        >
          {m.label}
        </div>
      ))}

      {/* Dynamic Floating Buttons: Projected Annotation Markers */}
      {showAnnotations && projectedAnnotations.map((anno, index) => {
        const fullAnno = annotations.find(a => a.id === anno.id);
        const isOpen = fullAnno?.status === 'Open';
        const isQuestion = fullAnno?.status === 'Question';
        const colorClass = isOpen 
          ? 'bg-amber-500 hover:bg-amber-600 border-amber-300 ring-amber-300/30' 
          : isQuestion 
            ? 'bg-sky-500 hover:bg-sky-600 border-sky-300 ring-sky-300/30'
            : 'bg-emerald-500 hover:bg-emerald-600 border-emerald-300 ring-emerald-300/30';

        return (
          <button
            key={anno.id}
            id={`annotation-marker-${anno.id}`}
            style={{ 
              left: `${anno.x}px`, 
              top: `${anno.y}px`, 
              transform: 'translate(-50%, -50%)' 
            }}
            onClick={() => fullAnno && jumpCameraToAnnotation(fullAnno)}
            className={`absolute pointer-events-auto w-6 h-6 rounded-full border-2 text-white flex items-center justify-center font-semibold text-xs transition-all duration-75 cursor-pointer shadow-lg select-none hover:scale-110 active:scale-95 ring-4 z-10 ${colorClass} ${anno.visible ? 'opacity-100 scale-100' : 'opacity-0 scale-50 pointer-events-none'}`}
          >
            {index + 1}
          </button>
        );
      })}

      {/* Canvas Block */}
      <div className="relative flex-1 flex flex-col h-full overflow-hidden">
        
        {/* Loading overlay & textures warnings */}
        {!isLoaded && !loadingError && (
          <div className="absolute inset-0 bg-slate-900/90 backdrop-blur flex flex-col items-center justify-center text-white z-50 p-6">
            <Compass className="w-12 h-12 text-blue-500 animate-spin mb-4" />
            <p className="font-semibold text-lg mb-2">Importing & Rendering 3D Model...</p>
            <div className="w-64 bg-slate-800 rounded-full h-2 overflow-hidden mb-2">
              <div className="bg-blue-500 h-full transition-all duration-300" style={{ width: `${loadingProgress}%` }}></div>
            </div>
            <p className="text-slate-400 text-xs">{loadingProgress}% completed</p>
          </div>
        )}

        {loadingError && (
          <div className="absolute inset-0 bg-slate-900/95 flex flex-col items-center justify-center text-white z-50 p-6 text-center">
            <AlertCircle className="w-12 h-12 text-rose-500 mb-4" />
            <p className="font-semibold text-lg text-rose-400 mb-2">Import Issue Detected</p>
            <p className="text-slate-300 max-w-md text-sm mb-4 leading-relaxed">{loadingError}</p>
            <button 
              onClick={() => setLoadingError(null)} 
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded-lg font-medium transition"
            >
              Dismiss and View Anyway
            </button>
          </div>
        )}

        {/* 3D WebGL Canvas */}
        <canvas 
          ref={canvasRef} 
          onClick={handleCanvasClick}
          onMouseMove={handleCanvasMouseMove}
          className="w-full h-full cursor-grab active:cursor-grabbing outline-none flex-1" 
        />

        {/* Floating Tool Bar overlay inside Canvas */}
        <div className="absolute top-4 left-4 right-4 flex flex-wrap gap-2 items-center justify-between pointer-events-none z-20">
          
          {/* Main Interaction Tools Selection */}
          <div className="flex bg-slate-900/90 backdrop-blur p-1 rounded-xl border border-slate-700 pointer-events-auto shadow-lg">
            <button
              id="tool-orbit-btn"
              onClick={() => { setActiveTool('orbit'); cancelActiveMeasurement(); }}
              className={`p-2 rounded-lg flex items-center gap-1.5 text-xs font-semibold transition ${activeTool === 'orbit' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
              title="Navigate & Orbit model"
            >
              <Compass className="w-4 h-4" />
              <span>Orbit</span>
            </button>
            <button
              id="tool-measure-btn"
              onClick={() => { 
                if (viewOnly && !metadata.shareSettings.guestsCanMeasure) return;
                setActiveTool('measure'); 
              }}
              disabled={viewOnly && !metadata.shareSettings.guestsCanMeasure}
              className={`p-2 rounded-lg flex items-center gap-1.5 text-xs font-semibold transition ${activeTool === 'measure' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed'}`}
              title="Measure point-to-point distance"
            >
              <Ruler className="w-4 h-4" />
              <span>Measure</span>
            </button>
            <button
              id="tool-annotate-btn"
              onClick={() => { 
                if (viewOnly && !metadata.shareSettings.guestsCanAnnotate) return;
                setActiveTool('annotate'); 
                cancelActiveMeasurement(); 
              }}
              disabled={viewOnly && !metadata.shareSettings.guestsCanAnnotate}
              className={`p-2 rounded-lg flex items-center gap-1.5 text-xs font-semibold transition ${activeTool === 'annotate' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed'}`}
              title="Click on model to annotate"
            >
              <Plus className="w-4 h-4" />
              <span>Annotate</span>
            </button>
          </div>

          {/* Quick viewport buttons */}
          <div className="flex items-center gap-1.5 bg-slate-900/90 backdrop-blur p-1 rounded-xl border border-slate-700 pointer-events-auto shadow-lg">
            <button
              id="btn-reset-view"
              onClick={handleResetView}
              className="p-2 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white transition"
              title="Reset View"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
            <button
              id="btn-set-thumbnail"
              onClick={handleSaveViewAsThumbnail}
              disabled={savingThumbnail}
              className={`p-2 rounded-lg transition ${saveThumbnailSuccess ? 'text-emerald-400 bg-emerald-950/40' : 'text-slate-400 hover:bg-slate-800 hover:text-white'} disabled:opacity-50`}
              title={saveThumbnailSuccess ? "Thumbnail Saved!" : "Set Current View as Thumbnail"}
            >
              <Camera className={`w-4 h-4 ${savingThumbnail ? 'animate-pulse' : ''}`} />
            </button>
            <button
              id="btn-toggle-annotations-visibility"
              onClick={() => setShowAnnotations(!showAnnotations)}
              className={`p-2 rounded-lg transition ${showAnnotations ? 'text-amber-400 hover:bg-slate-800' : 'text-slate-500 hover:bg-slate-800 hover:text-white'}`}
              title={showAnnotations ? "Hide Annotations" : "Show Annotations"}
            >
              {showAnnotations ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            </button>
            <button
              id="btn-toggle-measurements-visibility"
              onClick={() => setShowMeasurements(!showMeasurements)}
              className={`p-2 rounded-lg transition ${showMeasurements ? 'text-emerald-400 hover:bg-slate-800' : 'text-slate-500 hover:bg-slate-800 hover:text-white'}`}
              title={showMeasurements ? "Hide Measurements" : "Show Measurements"}
            >
              {showMeasurements ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            </button>
            <button
              id="btn-toggle-fullscreen"
              onClick={toggleFullscreen}
              className="p-2 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white transition"
              title="Fullscreen"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Bottom Banner warning about Scale */}
        {metadata.scaleStatus === 'unverified' && (
          <div className="absolute bottom-4 left-4 right-4 bg-amber-500/90 backdrop-blur text-slate-950 p-2 px-3 rounded-xl flex items-center justify-between text-xs font-semibold pointer-events-auto shadow-lg border border-amber-300">
            <div className="flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4 text-slate-950 shrink-0" />
              <span>Measurements may be inaccurate until scale is verified.</span>
            </div>
            {!viewOnly && (
              <button
                id="btn-calibrate-scale-banner"
                onClick={() => {
                  setIsCalibrating(true);
                  setActiveTool('measure');
                  setCalibrationPoint1(null);
                  setCalibrationPoint2(null);
                }}
                className="bg-slate-950 hover:bg-slate-900 text-white text-[10px] uppercase tracking-wider py-1 px-2.5 rounded-md font-bold transition ml-2 whitespace-nowrap"
              >
                Calibrate Scale
              </button>
            )}
          </div>
        )}

        {/* Temporary Builder feedback for Measurements */}
        {activeTool === 'measure' && activeMeasurementPoints.length > 0 && (
          <div className="absolute bottom-4 left-4 bg-slate-900/95 text-white p-3 rounded-xl border border-slate-700 pointer-events-auto shadow-lg text-xs font-semibold max-w-sm">
            {isCalibrating ? (
              <div>
                <p className="text-amber-400 font-bold mb-1 uppercase tracking-wide text-[10px]">Calibrating Reference</p>
                {!calibrationPoint1 && <p>Click point #1 on the model to calibrate.</p>}
                {calibrationPoint1 && !calibrationPoint2 && <p>Point #1 set. Click point #2 on the model.</p>}
                {calibrationPoint1 && calibrationPoint2 && (
                  <div className="mt-2 space-y-2">
                    <p className="text-slate-300">Enter physical distance in meters:</p>
                    <div className="flex gap-1.5">
                      <input 
                        type="number" 
                        step="0.01" 
                        value={calibrationRealValue} 
                        onChange={(e) => setCalibrationRealValue(e.target.value)} 
                        className="bg-slate-800 border border-slate-600 rounded px-2 py-1 text-white w-24 text-xs focus:outline-none focus:border-blue-500"
                      />
                      <button 
                        onClick={handleCalibrateScaleSubmit} 
                        className="bg-blue-600 hover:bg-blue-500 px-3 py-1 rounded font-bold text-xs transition text-white"
                      >
                        Set Scale
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                <p className="text-blue-400 font-bold uppercase tracking-wide text-[10px]">Active Measurement</p>
                <p>Click second point on model to complete measurement.</p>
                <button 
                  onClick={cancelActiveMeasurement} 
                  className="mt-2 text-[10px] text-slate-400 hover:text-rose-400 underline text-left transition"
                >
                  Cancel measurement
                </button>
              </div>
            )}
          </div>
        )}

        {/* Simple popover form when placing a point annotation */}
        {isCreatingAnnotation && tempAnnotationPos && (
          <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-xs flex items-center justify-center p-4 z-40 pointer-events-auto">
            <form onSubmit={handleSaveAnnotation} className="bg-slate-900 border border-slate-700 p-5 rounded-2xl shadow-xl w-full max-w-sm space-y-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-2">
                <Plus className="w-4 h-4 text-blue-500" />
                <span>Add Annotation Point</span>
              </h3>
              
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Title / Label</label>
                <input 
                  type="text" 
                  value={newAnnotationForm.title}
                  onChange={(e) => setNewAnnotationForm(prev => ({ ...prev, title: e.target.value }))}
                  className="w-full bg-slate-800 border border-slate-700 text-slate-100 rounded-lg p-2 text-xs focus:outline-none focus:border-blue-500"
                  placeholder="e.g., Wall crack, Pipe detail"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Note Comment</label>
                <textarea 
                  rows={3}
                  value={newAnnotationForm.comment}
                  onChange={(e) => setNewAnnotationForm(prev => ({ ...prev, comment: e.target.value }))}
                  className="w-full bg-slate-800 border border-slate-700 text-slate-100 rounded-lg p-2 text-xs focus:outline-none focus:border-blue-500"
                  placeholder="Write details of review comment..."
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Status</label>
                  <select 
                    value={newAnnotationForm.status}
                    onChange={(e) => setNewAnnotationForm(prev => ({ ...prev, status: e.target.value as any }))}
                    className="w-full bg-slate-800 border border-slate-700 text-slate-100 rounded-lg p-2 text-xs focus:outline-none focus:border-blue-500"
                  >
                    <option value="Open">Open</option>
                    <option value="Resolved">Resolved</option>
                    <option value="Question">Question</option>
                  </select>
                </div>
                
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Your Name</label>
                  <input 
                    type="text"
                    value={newAnnotationForm.author}
                    onChange={(e) => setNewAnnotationForm(prev => ({ ...prev, author: e.target.value }))}
                    className="w-full bg-slate-800 border border-slate-700 text-slate-100 rounded-lg p-2 text-xs focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="flex gap-2 justify-end border-t border-slate-800 pt-3">
                <button
                  type="button"
                  onClick={() => { setIsCreatingAnnotation(false); setTempAnnotationPos(null); }}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg transition"
                >
                  Save Point
                </button>
              </div>
            </form>
          </div>
        )}
      </div>

      {/* Sidebar Panel - Controls List of Annotations, Measurements, Exporting */}
      <div className="w-full md:w-80 bg-slate-900 border-t md:border-t-0 md:border-l border-slate-800 flex flex-col h-[300px] md:h-full text-slate-300 overflow-hidden shrink-0">
        
        {/* Toggleable view tabs */}
        <div className="grid grid-cols-2 bg-slate-950 text-xs font-bold text-slate-400 tracking-wide border-b border-slate-800">
          <button 
            onClick={() => setSelectedAnnotation(null)} 
            className={`py-3 px-2 border-b-2 text-center transition ${!selectedAnnotation ? 'text-white border-blue-500 bg-slate-900/40' : 'border-transparent hover:text-white'}`}
          >
            Review Panel
          </button>
          <button 
            onClick={() => {
              if (annotations.length > 0) {
                setSelectedAnnotation(annotations[0]);
              }
            }} 
            className={`py-3 px-2 border-b-2 text-center transition ${selectedAnnotation ? 'text-white border-blue-500 bg-slate-900/40' : 'border-transparent hover:text-white'}`}
          >
            Feedback Form
          </button>
        </div>

        {/* Scrollable list items */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          
          {!selectedAnnotation ? (
            // --- MAIN LIST PANEL ---
            <div className="space-y-4">
              
              {/* Measurements Section */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <Ruler className="w-3.5 h-3.5 text-emerald-500" />
                    <span>Measurements ({measurements.length})</span>
                  </h4>
                  {/* Units selector */}
                  <div className="flex bg-slate-950 p-0.5 rounded-md border border-slate-800">
                    {(['m', 'cm', 'mm'] as const).map(u => (
                      <button
                        key={u}
                        onClick={() => setUnit(u)}
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase transition ${unit === u ? 'bg-emerald-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}
                      >
                        {u}
                      </button>
                    ))}
                  </div>
                </div>

                {measurements.length === 0 ? (
                  <p className="text-xs text-slate-500 italic py-2">No distances measured yet.</p>
                ) : (
                  <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                    {measurements.map((m) => (
                      <div key={m.id} className="flex items-center justify-between bg-slate-950 border border-slate-800 p-2 rounded-lg text-xs font-mono group">
                        <span className="text-slate-300 truncate pr-2">{m.name}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-emerald-400 font-bold">{formatDistance(m.distance)}</span>
                          {(!viewOnly || metadata.shareSettings.guestsCanMeasure) && (
                            <button
                              onClick={() => handleDeleteMeasurement(m.id)}
                              className="text-slate-500 hover:text-rose-400 transition cursor-pointer"
                              title="Delete measurement"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Annotations Section */}
              <div className="space-y-2 pt-2 border-t border-slate-800">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5 text-amber-500" />
                  <span>Annotations ({annotations.length})</span>
                </h4>

                {annotations.length === 0 ? (
                  <p className="text-xs text-slate-500 italic py-2">No annotation points added yet. Use the Annotate tool and click on the 3D model to place one.</p>
                ) : (
                  <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                    {annotations.map((a, index) => {
                      const isOpen = a.status === 'Open';
                      const isQuestion = a.status === 'Question';
                      const statusColor = isOpen 
                        ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' 
                        : isQuestion
                          ? 'bg-sky-500/20 text-sky-400 border-sky-500/30'
                          : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';

                      return (
                        <div 
                          key={a.id} 
                          onClick={() => jumpCameraToAnnotation(a)}
                          className="w-full text-left bg-slate-950 border border-slate-800 hover:border-slate-700 p-2.5 rounded-lg text-xs transition cursor-pointer space-y-1 block group"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-slate-200 flex items-center gap-1.5">
                              <span className="w-4 h-4 rounded-full bg-slate-800 text-slate-300 flex items-center justify-center font-mono text-[9px] font-bold">
                                {index + 1}
                              </span>
                              <span className="truncate max-w-[120px]">{a.title}</span>
                            </span>
                            <span className={`px-1.5 py-0.5 rounded text-[9px] uppercase font-bold border ${statusColor}`}>
                              {a.status}
                            </span>
                          </div>
                          <p className="text-slate-400 line-clamp-1 italic">&ldquo;{a.comment}&rdquo;</p>
                          <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1 font-mono">
                            <span>By {a.author}</span>
                            <span>{a.replies?.length || 0} replies</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* PDF/CSV Report exports block */}
              <div className="space-y-2 pt-4 border-t border-slate-800">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Export Review Data</h4>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={handleExportReport}
                    className="p-2 bg-slate-950 border border-slate-800 hover:bg-slate-800 text-slate-200 rounded-lg text-xs font-medium transition flex items-center justify-center gap-1.5"
                  >
                    <Send className="w-3.5 h-3.5 text-blue-500" />
                    <span>Export Text Report</span>
                  </button>
                  <button
                    onClick={handleTakeScreenshot}
                    className="p-2 bg-slate-950 border border-slate-800 hover:bg-slate-800 text-slate-200 rounded-lg text-xs font-medium transition flex items-center justify-center gap-1.5"
                  >
                    <Maximize2 className="w-3.5 h-3.5 text-emerald-500" />
                    <span>Take Screenshot</span>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            // --- DETAILED ANNOTATION FOCUS PANEL & REPLIES ---
            <div className="space-y-4">
              <button
                onClick={() => setSelectedAnnotation(null)}
                className="text-xs text-blue-400 hover:underline flex items-center gap-1"
              >
                &larr; Back to full list
              </button>

              <div className="bg-slate-950 border border-slate-800 p-3.5 rounded-xl space-y-2.5">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <h4 className="font-bold text-slate-100 text-sm truncate pr-2">{selectedAnnotation.title}</h4>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className={`px-1.5 py-0.5 rounded text-[9px] uppercase font-bold border ${
                      selectedAnnotation.status === 'Open' 
                        ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' 
                        : selectedAnnotation.status === 'Question'
                          ? 'bg-sky-500/20 text-sky-400 border-sky-500/30'
                          : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                    }`}>
                      {selectedAnnotation.status}
                    </span>
                    {(!viewOnly || selectedAnnotation.author === 'Guest Reviewer') && (
                      <button
                        onClick={() => handleDeleteAnnotation(selectedAnnotation.id)}
                        className="text-slate-500 hover:text-rose-400 transition"
                        title="Delete annotation"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                <p className="text-xs text-slate-200 leading-relaxed italic bg-slate-900/60 p-2.5 rounded-lg border border-slate-800/60">
                  &ldquo;{selectedAnnotation.comment}&rdquo;
                </p>

                <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono">
                  <span>Author: <span className="text-slate-300 font-bold">{selectedAnnotation.author}</span></span>
                  <span>{selectedAnnotation.date}</span>
                </div>
              </div>

              {/* Replies Sub-section */}
              <div className="space-y-2.5">
                <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Replies / Conversation</h5>
                
                {selectedAnnotation.replies.length === 0 ? (
                  <p className="text-xs text-slate-500 italic pl-1">No replies yet. Type a comment below to reply.</p>
                ) : (
                  <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                    {selectedAnnotation.replies.map((reply) => (
                      <div key={reply.id} className="bg-slate-950 border border-slate-800 p-2.5 rounded-lg text-xs space-y-1">
                        <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono">
                          <span className="font-bold text-slate-300">{reply.author}</span>
                          <span>{reply.date}</span>
                        </div>
                        <p className="text-slate-300 leading-normal font-sans">&ldquo;{reply.comment}&rdquo;</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Reply Form */}
                <form onSubmit={handleSaveReply} className="flex gap-1.5 pt-2 border-t border-slate-800">
                  <input
                    type="text"
                    value={newReplyText}
                    onChange={(e) => setNewReplyText(e.target.value)}
                    placeholder="Type your reply comment..."
                    className="flex-1 bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500"
                    required
                  />
                  <button
                    type="submit"
                    className="p-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition shrink-0"
                    title="Send Reply"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </form>
              </div>
            </div>
          )}
        </div>

        {/* Bottom Help Instructions Box */}
        {showHelp && (
          <div className="p-3.5 bg-slate-950 border-t border-slate-800 text-[11px] text-slate-400 leading-relaxed flex items-start gap-2 select-none relative">
            <HelpCircle className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-bold text-slate-200">3D Interaction Help</p>
              <ul className="space-y-0.5 list-disc pl-3">
                <li><b className="text-slate-300">Orbit/Rotate:</b> Left-Click + Drag</li>
                <li><b className="text-slate-300">Pan model:</b> Right-Click + Drag</li>
                <li><b className="text-slate-300">Zoom:</b> Scroll Wheel / Pinch</li>
                <li><b className="text-slate-300">Measure / Note:</b> Select tool & click model</li>
              </ul>
            </div>
            <button 
              onClick={() => setShowHelp(false)} 
              className="absolute top-2 right-2 text-slate-600 hover:text-slate-400 text-[9px] uppercase tracking-wider font-bold"
            >
              Hide
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
