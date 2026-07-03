'use client';

import React, { useEffect, useState, use } from 'react';
import { 
  KeyRound, ShieldAlert, Compass, Eye, ShieldCheck, 
  MessageSquare, HelpCircle, Info, Lock
} from 'lucide-react';
import ModelViewerWrapper from '@/components/ModelViewerWrapper';
import { ModelMetadata, Annotation, Measurement } from '@/lib/storage';
import { getModelMetadata, getAnnotations, getMeasurements, saveAnnotations, saveMeasurements } from '@/lib/firebase-db';

export default function GuestSharePage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const id = resolvedParams.id;

  // Authentication & Access state
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [passwordValue, setPasswordValue] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  // Model & State
  const [metadata, setMetadata] = useState<ModelMetadata | null>(null);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [measurements, setMeasurements] = useState<Measurement[]>([]);

  // Page States
  const [isLoading, setIsLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [guestRole, setGuestRole] = useState<'view' | 'review'>('view');

  const checkSharingAccess = async () => {
    setIsLoading(true);
    setPageError(null);
    try {
      // Fetch public metadata check (e.g. checks if model exists and if sharing enabled)
      const meta = await getModelMetadata(id);
      if (!meta) {
        throw new Error('This shared 3D project model was not found.');
      }

      if (!meta.shareSettings || !meta.shareSettings.enabled) {
        throw new Error('Sharing is currently disabled for this project model by the owner.');
      }

      setMetadata(meta);
      setGuestRole(meta.shareSettings.mode);

      // Check if password exists. If no password, we are auto-authenticated!
      const password = meta.shareSettings.password;
      if (!password || password.trim() === '') {
        // Automatically fetch data and authorize
        setIsAuthenticated(true);
        await loadReviewData();
      }
    } catch (err: any) {
      setPageError(err.message || 'Access error.');
    } finally {
      setIsLoading(false);
    }
  };

  const loadReviewData = async () => {
    try {
      const annData = await getAnnotations(id);
      setAnnotations(annData);

      const measData = await getMeasurements(id);
      setMeasurements(measData);
    } catch (e) {
      console.error('Failed to pre-fetch reviewer data', e);
    }
  };

  // Verify access status and load data
  useEffect(() => {
    if (id) {
      const timer = setTimeout(() => {
        checkSharingAccess();
      }, 0);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Submit password check
  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordValue.trim()) return;

    setIsVerifying(true);
    setAuthError(null);

    try {
      if (metadata && metadata.shareSettings.password && metadata.shareSettings.password !== passwordValue) {
        setAuthError('Incorrect password.');
      } else {
        setIsAuthenticated(true);
        setGuestRole(metadata?.shareSettings.mode || 'view');
        await loadReviewData();
      }
    } catch (err: any) {
      setAuthError(err.message || 'Failed to authenticate.');
    } finally {
      setIsVerifying(false);
    }
  };

  // Callback: Save annotations (Review mode only)
  const handleSaveAnnotations = async (updatedAnnotations: Annotation[]) => {
    if (guestRole === 'view' || !metadata?.shareSettings?.guestsCanAnnotate) return;
    setAnnotations(updatedAnnotations);
    try {
      await saveAnnotations(id, updatedAnnotations);
    } catch (e) {
      console.error('Failed to sync annotation', e);
    }
  };

  // Callback: Save measurements (Review mode only)
  const handleSaveMeasurements = async (updatedMeasurements: Measurement[]) => {
    if (guestRole === 'view' || !metadata?.shareSettings?.guestsCanMeasure) return;
    setMeasurements(updatedMeasurements);
    try {
      await saveMeasurements(id, updatedMeasurements);
    } catch (e) {
      console.error('Failed to sync measurement', e);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center font-sans gap-4 p-6" id="loading-view">
        <Compass className="w-12 h-12 text-blue-500 animate-spin" />
        <p className="font-semibold text-lg">Loading shared project workspace...</p>
        <p className="text-slate-500 text-xs">Checking authorization status...</p>
      </div>
    );
  }

  if (pageError) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center font-sans gap-4 p-6 text-center" id="error-view">
        <ShieldAlert className="w-12 h-12 text-rose-500" />
        <h2 className="font-bold text-lg text-rose-400">Access Denied</h2>
        <p className="text-slate-400 max-w-sm text-sm leading-relaxed">{pageError}</p>
        <p className="text-[11px] text-slate-500">Contact the project administrator or model owner for assistance.</p>
      </div>
    );
  }

  // PASSWORDS FORM LANDING VIEW
  if (!isAuthenticated && metadata) {
    return (
      <main className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center font-sans p-6" id="password-form-view">
        <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl space-y-6">
          <div className="text-center space-y-2">
            <div className="w-14 h-14 bg-blue-600/15 text-blue-500 border border-blue-500/30 rounded-2xl flex items-center justify-center mx-auto shadow-inner">
              <Lock className="w-6 h-6" />
            </div>
            <h2 className="text-lg font-extrabold tracking-tight">Protected Model Workspace</h2>
            <p className="text-slate-400 text-xs">Enter password to view <b>{metadata.name}</b></p>
          </div>

          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Workspace Password</label>
              <input
                id="guest-password-input"
                type="password"
                required
                value={passwordValue}
                onChange={(e) => setPasswordValue(e.target.value)}
                placeholder="Enter workspace key..."
                className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500 rounded-xl p-3 text-sm text-white focus:outline-none placeholder-slate-600"
              />
            </div>

            {authError && (
              <p className="text-xs text-rose-400 font-bold flex items-center gap-1">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>{authError}</span>
              </p>
            )}

            <button
              id="guest-password-submit-btn"
              type="submit"
              disabled={isVerifying}
              className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold rounded-xl text-xs uppercase tracking-wider transition shadow-lg shadow-blue-600/25"
            >
              {isVerifying ? 'Decrypting Workspace...' : 'Access Shared Model'}
            </button>
          </form>
        </div>
      </main>
    );
  }

  // RENDER MAIN SHADOW VIEW
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans" id="guest-viewer-main">
      {/* Top bar info */}
      <header className="bg-slate-900/90 backdrop-blur border-b border-slate-800 py-4 px-6 flex flex-col md:flex-row md:items-center justify-between gap-4 z-10 select-none shrink-0" id="viewer-header">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-600/15 text-blue-500 border border-blue-500/20 flex items-center justify-center">
            <Compass className="w-4 h-4 animate-pulse" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-white">{metadata?.name}</h1>
            <p className="text-[10px] text-slate-400">Reviewer Portal • Verified Guest Access</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {guestRole === 'review' ? (
            <span className="bg-emerald-950 text-emerald-300 font-bold px-2.5 py-1 rounded-full border border-emerald-800/60 flex items-center gap-1.5 font-mono text-[9px] uppercase">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Review Mode (Active)</span>
            </span>
          ) : (
            <span className="bg-slate-800 text-slate-400 font-bold px-2.5 py-1 rounded-full border border-slate-700/60 flex items-center gap-1.5 font-mono text-[9px] uppercase">
              <Eye className="w-3.5 h-3.5 text-slate-400" />
              <span>View-Only Mode</span>
            </span>
          )}
        </div>
      </header>

      {/* 3D Model Render Canvas view viewport */}
      <div className="flex-1 p-4 md:p-6 flex items-center justify-center">
        <div className="w-full max-w-7xl">
          {metadata && (
            <ModelViewerWrapper
              id={id}
              metadata={metadata}
              initialAnnotations={annotations}
              initialMeasurements={measurements}
              role="reviewer"
              viewOnly={guestRole === 'view'}
              onSaveAnnotations={handleSaveAnnotations}
              onSaveMeasurements={handleSaveMeasurements}
            />
          )}
        </div>
      </div>
    </main>
  );
}
