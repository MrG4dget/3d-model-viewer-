'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { 
  FileUp, Folder, Plus, Trash2, Globe, Lock, Unlock, Eye, Calendar, HardDrive, 
  Settings, Copy, Check, ChevronRight, Compass, ShieldAlert, Sparkles, X, KeyRound,
  Cloud
} from 'lucide-react';
import { ModelMetadata } from '@/lib/storage';
import { googleSignIn, initAuth, getAccessToken } from '@/lib/firebase-auth';
import { listModels, importModelClient, deleteModel, saveModelMetadata } from '@/lib/firebase-db';
import Script from 'next/script';

// Declare google type for the picker
declare const google: any;

export default function OwnerDashboard() {
  const [models, setModels] = useState<ModelMetadata[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Upload States
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Sharing Modal/Panel States
  const [activeShareModel, setActiveShareModel] = useState<ModelMetadata | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [passwordInput, setPasswordInput] = useState('');
  const [shareMode, setShareMode] = useState<'view' | 'review'>('review');
  const [guestsCanAnnotate, setGuestsCanAnnotate] = useState(true);
  const [guestsCanMeasure, setGuestsCanMeasure] = useState(true);

  const fetchModels = async () => {
    setIsLoading(true);
    try {
      const data = await listModels();
      setModels(data);
    } catch (err: any) {
      setError(err.message || 'Failed to retrieve models from storage.');
    } finally {
      setIsLoading(false);
    }
  };

  // Load models on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchModels();
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const [pickerLoaded, setPickerLoaded] = useState(false);
  const [isDriveLoading, setIsDriveLoading] = useState(false);

  useEffect(() => {
    const unsubscribe = initAuth();
    const checkGapi = () => {
      if (typeof window !== 'undefined' && (window as any).gapi) {
        (window as any).gapi.load('picker', () => {
          setPickerLoaded(true);
        });
      } else {
        setTimeout(checkGapi, 500);
      }
    };
    checkGapi();
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  const handleGoogleDriveImport = async () => {
    try {
      setIsDriveLoading(true);
      setUploadError(null);
      let token = await getAccessToken();
      if (!token) {
        const result = await googleSignIn();
        if (result) {
          token = result.accessToken;
        } else {
          setIsDriveLoading(false);
          return;
        }
      }

      const pickerOrigin =
        window.location.ancestorOrigins &&
        window.location.ancestorOrigins.length > 0
          ? window.location.ancestorOrigins[window.location.ancestorOrigins.length - 1]
          : window.location.origin;

      const picker = new google.picker.PickerBuilder()
        .addView(new google.picker.DocsView().setIncludeFolders(true))
        .setOAuthToken(token)
        .setDeveloperKey('') // We use token instead
        .setCallback(async (data: any) => {
          if (data.action === google.picker.Action.PICKED) {
            const file = data.docs[0];
            await processDriveFile(file.id, file.name, token as string);
          } else if (data.action === google.picker.Action.CANCEL) {
            setIsDriveLoading(false);
          }
        })
        .setOrigin(pickerOrigin)
        .build();
      picker.setVisible(true);
    } catch (err: any) {
      if (err?.code !== "auth/popup-closed-by-user" && !err?.message?.includes("popup-closed-by-user")) console.error(err);
      setIsDriveLoading(false);
      if (err.code !== 'auth/popup-closed-by-user' && !err.message?.includes('popup-closed-by-user')) {
        setUploadError(err.message || 'Failed to connect to Google Drive.');
      }
    }
  };

  const processDriveFile = async (fileId: string, fileName: string, accessToken: string) => {
    try {
      setUploadProgress(`Downloading ${fileName} from Drive...`);
      const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) {
        throw new Error('Failed to download file from Drive');
      }
      const blob = await res.blob();
      const file = new File([blob], fileName, { type: blob.type || 'application/octet-stream' });
      await processUpload(file);
    } catch (err: any) {
      if (err?.code !== "auth/popup-closed-by-user" && !err?.message?.includes("popup-closed-by-user")) console.error(err);
      setUploadError(err.message || 'Failed to download or import from Google Drive.');
    } finally {
      setIsDriveLoading(false);
    }
  };

  // Drag and drop event handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      await processUpload(files[0]);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      await processUpload(files[0]);
    }
  };

  // Handle Model Upload API Call
  const processUpload = async (file: File) => {
    const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    if (ext !== '.glb' && ext !== '.zip') {
      setUploadError('Invalid file format. Please upload a .glb model file or a .zip archive.');
      return;
    }

    setUploadError(null);
    setUploadProgress('Reading and uploading archive...');

    try {
      const buffer = await file.arrayBuffer();
      await importModelClient(file.name, buffer);

      await fetchModels();
      setUploadProgress(null);
    } catch (err: any) {
      setUploadProgress(null);
      setUploadError(err.message || 'Failed to upload and import the 3D model.');
    }
  };

  // Delete a model
  const handleDeleteModel = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete the model "${name}"? This will permanently remove all files, measurements, and annotations.`)) {
      return;
    }

    try {
      await deleteModel(id);
      setModels(prev => prev.filter(m => m.id !== id));
      if (activeShareModel?.id === id) setActiveShareModel(null);
    } catch (err: any) {
      alert('Failed to delete model from database.');
    }
  };

  // Open sharing configuration modal
  const openShareModal = (model: ModelMetadata) => {
    setActiveShareModel(model);
    setPasswordInput(model.shareSettings.password || '');
    setShareMode(model.shareSettings.mode || 'review');
    setGuestsCanAnnotate(model.shareSettings.guestsCanAnnotate !== false);
    setGuestsCanMeasure(model.shareSettings.guestsCanMeasure !== false);
  };

  // Save sharing configuration changes
  const handleSaveShareSettings = async () => {
    if (!activeShareModel) return;

    const newSettings = {
      enabled: true,
      password: passwordInput,
      mode: shareMode,
      guestsCanAnnotate,
      guestsCanMeasure
    };

    try {
      const newMetadata = { ...activeShareModel, shareSettings: newSettings as any };
      await saveModelMetadata(activeShareModel.id, newMetadata);
      
      // Update models list
      setModels(prev => prev.map(m => m.id === activeShareModel.id ? newMetadata : m));
      setActiveShareModel(newMetadata);
    } catch (err) {
      alert('Failed to save sharing configurations.');
    }
  };

  // Disable/revoke sharing
  const handleDisableSharing = async () => {
    if (!activeShareModel) return;

    const newSettings = {
      enabled: false,
      password: '',
      mode: 'view' as const,
      guestsCanAnnotate: true,
      guestsCanMeasure: true
    };

    try {
      const newMetadata = { ...activeShareModel, shareSettings: newSettings };
      await saveModelMetadata(activeShareModel.id, newMetadata);
      
      setModels(prev => prev.map(m => m.id === activeShareModel.id ? newMetadata : m));
      setActiveShareModel(newMetadata);
    } catch (err) {
      alert('Failed to revoke sharing.');
    }
  };

  // Copy share link to clipboard
  const copyShareLink = (modelId: string) => {
    const shareUrl = `${window.location.origin}/share/${modelId}`;
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopiedId(modelId);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  // Helper to format bytes
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans" id="owner-dashboard-main">
      {/* Dynamic Header */}
      <header className="bg-white border-b border-slate-200 py-6 px-8 shadow-xs shrink-0" id="header-section">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
              <Compass className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900">3D Model Review App</h1>
              <p className="text-xs text-slate-500">Secure owner dashboard to import, review, calibrate and share models</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 bg-slate-100 p-2 px-3 rounded-full border border-slate-200">
            <HardDrive className="w-4 h-4 text-slate-400" />
            <span>Standard Self-Hosted Cloud Run</span>
          </div>
        </div>
      </header>

      <div className="flex-1 max-w-7xl w-full mx-auto p-6 md:p-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Hand: Upload Zone & Welcome Instructions */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <FileUp className="w-5 h-5 text-blue-600" />
                <span>Upload New Model</span>
              </h2>
              <p className="text-xs text-slate-500 mt-1">Select a single .glb model file or a zip archive with models and textures.</p>
            </div>

            {/* Drag & Drop Card */}
            <div
              id="upload-dropzone"
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition relative overflow-hidden group ${
                isDragging 
                  ? 'border-blue-500 bg-blue-50/50' 
                  : 'border-slate-200 hover:border-blue-400 hover:bg-slate-50/50'
              }`}
            >
              <input
                id="file-upload-input"
                type="file"
                onChange={handleFileChange}
                accept=".glb,.zip"
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
              <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mb-3 transition group-hover:scale-110">
                <Folder className="w-6 h-6" />
              </div>
              <p className="text-sm font-semibold text-slate-800">Drag & drop your file here</p>
              <p className="text-xs text-slate-400 mt-1">or click to browse your system</p>
            </div>

            {/* Google Drive Import */}
            <div className="flex items-center justify-center w-full">
              <button
                onClick={handleGoogleDriveImport}
                disabled={!pickerLoaded || isDriveLoading}
                className="w-full flex items-center justify-center gap-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold text-sm py-2.5 px-4 rounded-xl shadow-sm transition disabled:opacity-50"
              >
                {isDriveLoading ? (
                  <Compass className="w-4 h-4 animate-spin text-blue-600" />
                ) : (
                  <Cloud className="w-4 h-4 text-blue-600" />
                )}
                <span>Import from Google Drive</span>
              </button>
            </div>

            {/* Upload Feedback */}
            {uploadProgress && (
              <div className="bg-blue-50 border border-blue-200 text-blue-800 p-3 rounded-lg text-xs font-semibold flex items-center gap-2 animate-pulse">
                <Compass className="w-4 h-4 animate-spin text-blue-600" />
                <span>{uploadProgress}</span>
              </div>
            )}

            {uploadError && (
              <div className="bg-rose-50 border border-rose-200 text-rose-800 p-3 rounded-lg text-xs font-semibold flex items-start gap-2">
                <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{uploadError}</span>
              </div>
            )}
          </div>

          {/* Quick Help card */}
          <div className="bg-slate-900 text-slate-300 rounded-2xl p-6 shadow-sm space-y-4 border border-slate-800">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span>MVP Success Guidelines</span>
            </h3>
            <ul className="text-xs space-y-2.5 leading-relaxed text-slate-400 list-disc pl-4">
              <li>Upload a <b className="text-white">GLB</b> or a <b className="text-white">ZIP</b> containing a GLTF + embedded texture files.</li>
              <li>Calibrate scale on unverified models inside the viewer using a reference distance.</li>
              <li>Toggle public share links, define an optional security password, and set user access constraints.</li>
            </ul>
          </div>
        </div>

        {/* Right Hand: Models List */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="border-b border-slate-100 py-5 px-6 flex items-center justify-between bg-slate-50/50">
              <div>
                <h2 className="text-base font-bold text-slate-900">Your Models Directory</h2>
                <p className="text-xs text-slate-500 mt-0.5">Manage and share imported project models</p>
              </div>
              <span className="text-[10px] font-bold tracking-wider uppercase text-slate-400 bg-slate-200 px-2 py-1 rounded-md">
                {models.length} Model{models.length !== 1 ? 's' : ''}
              </span>
            </div>

            {isLoading ? (
              <div className="p-12 text-center text-slate-400 flex flex-col items-center justify-center gap-3">
                <Compass className="w-8 h-8 text-blue-500 animate-spin" />
                <p className="text-xs font-medium">Scanning local data directories...</p>
              </div>
            ) : error ? (
              <div className="p-12 text-center text-rose-500 flex flex-col items-center justify-center gap-2">
                <ShieldAlert className="w-8 h-8" />
                <p className="text-sm font-semibold">{error}</p>
              </div>
            ) : models.length === 0 ? (
              <div className="p-16 text-center text-slate-400 flex flex-col items-center justify-center gap-4">
                <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                  <Folder className="w-8 h-8" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-800">No models imported yet</p>
                  <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">Upload a model on the left panel to begin reviewing, calibrating, and sharing with clients.</p>
                </div>
              </div>
            ) : (
              <div className="divide-y divide-slate-100" id="models-list-block">
                {models.map((model) => {
                  const isShared = model.shareSettings?.enabled;
                  const hasPassword = !!model.shareSettings?.password;

                  return (
                    <div key={model.id} className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-slate-50/40 transition">
                      
                      {/* Thumbnail and metadata info */}
                      <div className="flex items-center gap-4 flex-1 min-w-0">
                        {/* 3D Model Thumbnail */}
                        <div className="w-16 h-16 rounded-xl bg-slate-100 border border-slate-200 overflow-hidden shrink-0 flex items-center justify-center relative shadow-inner">
                          {model.hasThumbnail ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={`/api/models/${model.id}/thumbnail?v=${model.lastOpenedDate ? new Date(model.lastOpenedDate).getTime() : new Date(model.uploadDate).getTime()}`}
                              alt={`${model.name} Preview`}
                              className="w-full h-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <Compass className="w-6 h-6 text-slate-400 animate-pulse" />
                          )}
                        </div>

                        {/* Name / Date Metadata */}
                        <div className="space-y-1.5 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-bold text-slate-900 truncate max-w-[240px]">{model.name}</h3>
                            
                            {/* Share status label */}
                            {isShared ? (
                              <span className="flex items-center gap-1 bg-emerald-50 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-200">
                                <Globe className="w-3 h-3" />
                                <span>Shared {hasPassword ? '(Locked)' : '(Public)'}</span>
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 bg-slate-100 text-slate-600 text-[10px] font-bold px-2 py-0.5 rounded-full border border-slate-200">
                                <Lock className="w-3 h-3 text-slate-400" />
                                <span>Private</span>
                              </span>
                            )}

                            {/* Texture status label */}
                            {model.loadingStatus === 'Ready' ? (
                              <span className="bg-blue-50 text-blue-700 text-[10px] font-bold px-2 py-0.5 rounded-full border border-blue-200">Textures Ready</span>
                            ) : (
                              <span className="bg-amber-50 text-amber-700 text-[10px] font-bold px-2 py-0.5 rounded-full border border-amber-200">Needs Attention</span>
                            )}
                          </div>

                          {/* File attributes metadata line */}
                          <div className="flex items-center gap-4 text-xs text-slate-500 flex-wrap">
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3.5 h-3.5 text-slate-400" />
                              <span>Uploaded: {new Date(model.uploadDate).toLocaleDateString()}</span>
                            </span>
                            <span className="flex items-center gap-1">
                              <HardDrive className="w-3.5 h-3.5 text-slate-400" />
                              <span>{formatBytes(model.size)}</span>
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Control buttons */}
                      <div className="flex items-center gap-2 flex-wrap md:shrink-0">
                        {/* Open model view button */}
                        <Link 
                          href={`/view/${model.id}`}
                          id={`open-model-${model.id}`}
                          className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-4 py-2 rounded-xl transition flex items-center gap-1 shadow-sm"
                        >
                          <span>Open Viewer</span>
                          <ChevronRight className="w-4 h-4" />
                        </Link>

                        {/* Share Modal Trigger */}
                        <button
                          id={`share-model-btn-${model.id}`}
                          onClick={() => openShareModal(model)}
                          className="bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold px-3 py-2 rounded-xl border border-slate-200 transition flex items-center gap-1"
                        >
                          <Settings className="w-4 h-4" />
                          <span>Sharing</span>
                        </button>

                        {/* Delete Button */}
                        <button
                          id={`delete-model-${model.id}`}
                          onClick={() => handleDeleteModel(model.id, model.name)}
                          className="text-slate-400 hover:text-rose-600 hover:bg-rose-50 p-2 rounded-xl transition cursor-pointer"
                          title="Delete model"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Share / Settings Modal Panel Overlay */}
      {activeShareModel && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 pointer-events-auto" id="share-modal-overlay">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col">
            
            <div className="bg-slate-50 border-b border-slate-100 p-5 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-900 text-base">Share Model & Guest Access</h3>
                <p className="text-xs text-slate-500">Configure client or reviewer public links for: {activeShareModel.name}</p>
              </div>
              <button 
                onClick={() => setActiveShareModel(null)} 
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5 flex-1 overflow-y-auto">
              
              {/* Status block toggle */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex items-center justify-between">
                <div className="space-y-0.5">
                  <p className="text-xs font-bold text-slate-800">Share Link Activation</p>
                  <p className="text-[11px] text-slate-500">
                    {activeShareModel.shareSettings?.enabled 
                      ? "Public reviews are enabled for this model." 
                      : "Only you can view and annotate this model currently."
                    }
                  </p>
                </div>
                
                {activeShareModel.shareSettings?.enabled ? (
                  <button
                    onClick={handleDisableSharing}
                    className="bg-rose-100 hover:bg-rose-200 text-rose-800 text-xs font-bold px-3 py-1.5 rounded-lg border border-rose-200 transition"
                  >
                    Disable Link
                  </button>
                ) : (
                  <button
                    onClick={handleSaveShareSettings}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition"
                  >
                    Enable Share Link
                  </button>
                )}
              </div>

              {activeShareModel.shareSettings?.enabled && (
                <div className="space-y-4">
                  {/* Share Link display and copying */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Reviewer Share Link</label>
                    <div className="flex bg-slate-50 border border-slate-200 rounded-lg p-2 items-center gap-2">
                      <Globe className="w-4 h-4 text-emerald-500 shrink-0" />
                      <span className="text-xs font-mono select-all text-slate-700 truncate flex-1">
                        {`${window.location.origin}/share/${activeShareModel.id}`}
                      </span>
                      <button
                        onClick={() => copyShareLink(activeShareModel.id)}
                        className="bg-white hover:bg-slate-100 text-slate-700 p-1.5 rounded-md border border-slate-200 transition shrink-0 cursor-pointer flex items-center gap-1 text-[11px] font-semibold"
                      >
                        {copiedId === activeShareModel.id ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-500" />
                            <span>Copied!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>Copy</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Password Protection fields */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1">
                        <KeyRound className="w-3.5 h-3.5 text-slate-400" />
                        <span>Share Access Password</span>
                      </label>
                      <input 
                        type="text"
                        placeholder="Leave blank for no password"
                        value={passwordInput}
                        onChange={(e) => setPasswordInput(e.target.value)}
                        className="w-full bg-white border border-slate-200 text-slate-800 rounded-lg p-2 text-xs focus:outline-none focus:border-blue-500"
                      />
                      <p className="text-[9px] text-slate-400">If set, guests must enter this password to view the model.</p>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Reviewer Mode Permission</label>
                      <select
                        value={shareMode}
                        onChange={(e) => setShareMode(e.target.value as any)}
                        className="w-full bg-white border border-slate-200 text-slate-800 rounded-lg p-2 text-xs focus:outline-none focus:border-blue-500"
                      >
                        <option value="review">Review Mode (Add notes & measure)</option>
                        <option value="view">View Only (No actions allowed)</option>
                      </select>
                      <p className="text-[9px] text-slate-400">Determines guest capability controls.</p>
                    </div>
                  </div>

                  {/* Checkbox controls */}
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-3">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Detailed Guest Capabilities</p>
                    
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700">
                      <input 
                        type="checkbox"
                        checked={guestsCanAnnotate}
                        onChange={(e) => setGuestsCanAnnotate(e.target.checked)}
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        disabled={shareMode === 'view'}
                      />
                      <span>Allow guests to add and reply to annotation points</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700">
                      <input 
                        type="checkbox"
                        checked={guestsCanMeasure}
                        onChange={(e) => setGuestsCanMeasure(e.target.checked)}
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        disabled={shareMode === 'view'}
                      />
                      <span>Allow guests to measure distances on the model</span>
                    </label>
                  </div>
                </div>
              )}
            </div>

            <div className="bg-slate-50 border-t border-slate-100 p-4 flex gap-2 justify-end shrink-0">
              <button
                onClick={() => setActiveShareModel(null)}
                className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded-lg border border-slate-200 transition"
              >
                Close Panel
              </button>
              {activeShareModel.shareSettings?.enabled && (
                <button
                  onClick={handleSaveShareSettings}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg transition shadow-sm"
                >
                  Save Configurations
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      <Script src="https://apis.google.com/js/api.js" strategy="afterInteractive" crossOrigin="anonymous" />
    </main>
  );
}
