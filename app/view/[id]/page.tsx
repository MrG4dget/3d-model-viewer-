'use client';

import React, { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { 
  ArrowLeft, Compass, Info, FileText, KeyRound, Globe, HardDrive, 
  Settings, Save, Check, RefreshCw, AlertCircle, Edit3
} from 'lucide-react';
import ModelViewerWrapper from '@/components/ModelViewerWrapper';
import { ModelMetadata, Annotation, Measurement } from '@/lib/storage';
import { getModelMetadata, getAnnotations, getMeasurements, saveAnnotations, saveMeasurements, saveModelMetadata } from '@/lib/firebase-db';

export default function AdminViewPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  
  // Resolve params in Next.js 15 client component
  const resolvedParams = use(params);
  const id = resolvedParams.id;

  // Data States
  const [metadata, setMetadata] = useState<ModelMetadata | null>(null);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [measurements, setMeasurements] = useState<Measurement[]>([]);

  // Loading/Sync States
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSavingName, setIsSavingName] = useState(false);
  const [editNameValue, setEditNameValue] = useState('');
  const [isEditingName, setIsEditingName] = useState(false);

  const loadModelData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      // 1. Fetch metadata
      const metaData = await getModelMetadata(id);
      if (!metaData) throw new Error('Model metadata not found');
      setMetadata(metaData);
      setEditNameValue(metaData.name);

      // 2. Fetch annotations
      const annData = await getAnnotations(id);
      setAnnotations(annData);

      // 3. Fetch measurements
      const measData = await getMeasurements(id);
      setMeasurements(measData);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to retrieve 3D model data.');
    } finally {
      setIsLoading(false);
    }
  };

  // Load model and annotations on mount
  useEffect(() => {
    if (id) {
      const timer = setTimeout(() => {
        loadModelData();
      }, 0);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Callback: Save/sync annotations back to server
  const handleSaveAnnotations = async (updatedAnnotations: Annotation[]) => {
    setAnnotations(updatedAnnotations);
    try {
      await saveAnnotations(id, updatedAnnotations);
    } catch (e) {
      console.error('Failed to sync annotations with server', e);
    }
  };

  // Callback: Save/sync measurements back to server
  const handleSaveMeasurements = async (updatedMeasurements: Measurement[]) => {
    setMeasurements(updatedMeasurements);
    try {
      await saveMeasurements(id, updatedMeasurements);
    } catch (e) {
      console.error('Failed to sync measurements with server', e);
    }
  };

  // Callback: Update model settings or calibration
  const handleUpdateMetadata = async (updatedFields: Partial<ModelMetadata>) => {
    if (!metadata) return;

    const newMetadata = { ...metadata, ...updatedFields };
    setMetadata(newMetadata);

    try {
      await saveModelMetadata(id, newMetadata);
      setMetadata(newMetadata);
    } catch (e) {
      console.error('Failed to update metadata settings', e);
    }
  };

  // Submit model renaming
  const handleRenameModel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editNameValue.trim() || !metadata) return;

    setIsSavingName(true);
    try {
      await handleUpdateMetadata({ name: editNameValue });
      setIsEditingName(false);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSavingName(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center font-sans gap-4 p-6" id="loading-view">
        <Compass className="w-12 h-12 text-blue-500 animate-spin" />
        <p className="font-semibold text-lg">Fetching 3D model files & settings...</p>
        <p className="text-slate-500 text-xs">Awaiting server filesystem mount.</p>
      </div>
    );
  }

  if (error || !metadata) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center font-sans gap-4 p-6 text-center" id="error-view">
        <AlertCircle className="w-12 h-12 text-rose-500" />
        <h2 className="font-bold text-xl text-rose-400">Failed to Load Project Model</h2>
        <p className="text-slate-400 max-w-sm text-sm">{error || "The model was not found in database memory."}</p>
        <Link 
          href="/" 
          className="mt-2 bg-slate-800 hover:bg-slate-700 px-4 py-2 rounded-xl text-xs font-semibold transition"
        >
          Return to Dashboard
        </Link>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans" id="admin-viewer-main">
      {/* Top Bar Navigation */}
      <header className="bg-slate-900/90 backdrop-blur border-b border-slate-800 py-4 px-6 flex flex-col md:flex-row md:items-center justify-between gap-4 z-10 select-none shrink-0" id="viewer-header">
        <div className="flex items-center gap-4">
          <Link
            id="back-to-dashboard-link"
            href="/"
            className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300 hover:text-white transition cursor-pointer shrink-0"
            title="Return to Dashboard"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          
          <div className="space-y-1">
            {isEditingName ? (
              <form onSubmit={handleRenameModel} className="flex items-center gap-2">
                <input 
                  type="text"
                  value={editNameValue}
                  onChange={(e) => setEditNameValue(e.target.value)}
                  className="bg-slate-950 border border-slate-700 rounded-lg p-1 px-2 text-sm font-bold text-white focus:outline-none focus:border-blue-500"
                  required
                />
                <button 
                  type="submit" 
                  disabled={isSavingName}
                  className="p-1.5 bg-blue-600 hover:bg-blue-500 rounded-lg text-white transition cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                </button>
              </form>
            ) : (
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold tracking-tight text-white">{metadata.name}</h1>
                <button
                  onClick={() => setIsEditingName(true)}
                  className="p-1 text-slate-400 hover:text-white transition rounded"
                  title="Rename model"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            
            <div className="flex items-center gap-3 text-[10px] text-slate-400 font-mono">
              <span>Scale Status: <b className={metadata.scaleStatus === 'calibrated' ? 'text-emerald-400' : 'text-amber-400 font-bold'}>{metadata.scaleStatus.toUpperCase()}</b></span>
              <span>Multiplier: <b>{metadata.scaleRatio.toFixed(4)}x</b></span>
            </div>
          </div>
        </div>

        {/* Info panel bar */}
        <div className="flex items-center gap-3 text-xs">
          {metadata.shareSettings?.enabled ? (
            <span className="bg-emerald-950 text-emerald-300 font-bold px-2.5 py-1 rounded-full border border-emerald-800/60 flex items-center gap-1.5 font-mono text-[10px] uppercase">
              <Globe className="w-3.5 h-3.5" />
              <span>Share Link Live</span>
            </span>
          ) : (
            <span className="bg-slate-800 text-slate-400 font-bold px-2.5 py-1 rounded-full border border-slate-700/60 flex items-center gap-1.5 font-mono text-[10px] uppercase">
              <KeyRound className="w-3.5 h-3.5" />
              <span>Private Mode</span>
            </span>
          )}
        </div>
      </header>

      {/* Main interactive 3D Canvas wrapper block */}
      <div className="flex-1 p-4 md:p-6 flex items-center justify-center">
        <div className="w-full max-w-7xl">
          <ModelViewerWrapper
            id={id}
            metadata={metadata}
            initialAnnotations={annotations}
            initialMeasurements={measurements}
            role="admin"
            viewOnly={false}
            onUpdateMetadata={handleUpdateMetadata}
            onSaveAnnotations={handleSaveAnnotations}
            onSaveMeasurements={handleSaveMeasurements}
          />
        </div>
      </div>
    </main>
  );
}
