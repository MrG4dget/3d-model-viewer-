'use client';

import dynamic from 'next/dynamic';
import React from 'react';
import { Compass } from 'lucide-react';

// Dynamically import ThreeViewer with SSR disabled
const DynamicThreeViewer = dynamic(() => import('./ThreeViewer'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[600px] bg-slate-900 rounded-2xl flex flex-col items-center justify-center text-white border border-slate-800">
      <Compass className="w-12 h-12 text-blue-500 animate-spin mb-4" />
      <p className="font-semibold text-lg">Initializing 3D Environment...</p>
      <p className="text-slate-400 text-xs mt-1 animate-pulse">Loading canvas & WebGL drivers...</p>
    </div>
  )
});

interface ModelViewerWrapperProps {
  id: string;
  metadata: any;
  initialAnnotations: any[];
  initialMeasurements: any[];
  role: 'admin' | 'reviewer';
  viewOnly: boolean;
  onUpdateMetadata?: (metadata: any) => void;
  onSaveAnnotations?: (annotations: any[]) => void;
  onSaveMeasurements?: (measurements: any[]) => void;
}

export default function ModelViewerWrapper(props: ModelViewerWrapperProps) {
  return <DynamicThreeViewer {...props} />;
}
