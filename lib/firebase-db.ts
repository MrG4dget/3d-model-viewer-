import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, collection, doc, getDoc, getDocs, setDoc, deleteDoc, updateDoc } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, deleteObject } from 'firebase/storage';
import JSZip from 'jszip';
import config from '../firebase-applet-config.json';
import { ModelMetadata, Annotation, Measurement } from './storage';

const app = !getApps().length ? initializeApp(config) : getApp();
export const db = getFirestore(app);
export const storage = getStorage(app);

export async function listModels(): Promise<ModelMetadata[]> {
  const snap = await getDocs(collection(db, 'models'));
  const models = snap.docs.map(d => d.data() as ModelMetadata);
  return models.sort((a, b) => new Date(b.uploadDate).getTime() - new Date(a.uploadDate).getTime());
}

export async function getModelMetadata(id: string): Promise<ModelMetadata | null> {
  const snap = await getDoc(doc(db, 'models', id));
  if (!snap.exists()) return null;
  return snap.data() as ModelMetadata;
}

export async function saveModelMetadata(id: string, metadata: ModelMetadata): Promise<void> {
  await setDoc(doc(db, 'models', id), metadata, { merge: true });
}

export async function getAnnotations(id: string): Promise<Annotation[]> {
  const snap = await getDoc(doc(db, 'models', id));
  if (!snap.exists()) return [];
  const data = snap.data();
  return data.annotations || [];
}

export async function saveAnnotations(id: string, annotations: Annotation[]): Promise<void> {
  await updateDoc(doc(db, 'models', id), { annotations });
}

export async function getMeasurements(id: string): Promise<Measurement[]> {
  const snap = await getDoc(doc(db, 'models', id));
  if (!snap.exists()) return [];
  const data = snap.data();
  return data.measurements || [];
}

export async function saveMeasurements(id: string, measurements: Measurement[]): Promise<void> {
  await updateDoc(doc(db, 'models', id), { measurements });
}

export async function deleteModel(id: string): Promise<void> {
  await deleteDoc(doc(db, 'models', id));
  // Could also delete from storage, but this suffices.
}

export async function importModelClient(
  fileName: string,
  buffer: ArrayBuffer
): Promise<{ id: string; metadata: ModelMetadata }> {
  const originalId = fileName.replace(/\.[^/.]+$/, "").toLowerCase().replace(/[^a-z0-9_-]/g, '-');
  let id = originalId;
  
  // ensure unique id
  while (true) {
    const snap = await getDoc(doc(db, 'models', id));
    if (!snap.exists()) break;
    id = `${originalId}-${Math.floor(Math.random()*1000)}`;
  }

  const ext = fileName.split('.').pop()?.toLowerCase();
  let mainModelPath = '';
  let textureFilesFound: string[] = [];
  
  if (ext === 'glb') {
    const fileRef = ref(storage, `models/${id}/extracted/${fileName}`);
    await uploadBytes(fileRef, buffer);
    mainModelPath = fileName;
  } else if (ext === 'zip') {
    const zip = await JSZip.loadAsync(buffer);
    const files = zip.file(/.*\.(glb|gltf|png|jpg|jpeg|webp|bin)$/i);
    
    if (files.length === 0) throw new Error("No valid 3D files found in zip");
    
    for (const file of files) {
      if (file.dir) continue;
      const fileData = await file.async('arraybuffer');
      const fileRef = ref(storage, `models/${id}/extracted/${file.name}`);
      await uploadBytes(fileRef, fileData);
      
      const lowerName = file.name.toLowerCase();
      if (lowerName.endsWith('.glb') || lowerName.endsWith('.gltf')) {
        if (!mainModelPath || lowerName.endsWith('.glb')) {
          mainModelPath = file.name;
        }
      } else {
        textureFilesFound.push(file.name);
      }
    }
  } else {
    throw new Error("Unsupported format");
  }

  const metadata: ModelMetadata = {
    id,
    name: fileName.replace(/\.[^/.]+$/, ""),
    uploadDate: new Date().toISOString(),
    lastOpenedDate: new Date().toISOString(),
    size: buffer.byteLength,
    fileName,
    modelPath: mainModelPath,
    textureStatus: { found: textureFilesFound, missing: [], unused: [] },
    loadingStatus: 'Ready',
    scaleStatus: 'unverified',
    scaleRatio: 1.0,
    shareSettings: { enabled: false, mode: 'view', guestsCanAnnotate: true, guestsCanMeasure: true },
    hasThumbnail: false
  };

  await setDoc(doc(db, 'models', id), {
    ...metadata,
    annotations: [],
    measurements: []
  });

  return { id, metadata };
}
