import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';

export interface ShareSettings {
  enabled: boolean;
  password?: string;
  mode: 'view' | 'review';
  guestsCanAnnotate: boolean;
  guestsCanMeasure: boolean;
}

export interface ModelMetadata {
  id: string;
  name: string;
  uploadDate: string;
  lastOpenedDate: string;
  size: number;
  fileName: string;
  modelPath: string; // relative path within extracted/
  textureStatus: {
    found: string[];
    missing: string[];
    unused: string[];
  };
  loadingStatus: 'Ready' | 'Failed' | 'Needs attention';
  scaleStatus: 'unverified' | 'verified' | 'calibrated';
  scaleRatio: number; // multiplier for distances, default 1.0
  referenceDistancePoints?: [number[], number[]];
  referenceDistanceValue?: number;
  shareSettings: ShareSettings;
  hasThumbnail?: boolean;
}

export interface AnnotationReply {
  id: string;
  author: string;
  comment: string;
  date: string;
}

export interface Annotation {
  id: string;
  title: string;
  comment: string;
  author: string;
  date: string;
  status: 'Open' | 'Resolved' | 'Question';
  position: [number, number, number]; // [x, y, z]
  replies: AnnotationReply[];
}

export interface Measurement {
  id: string;
  name: string;
  points: [number, number, number][]; // Array of [x, y, z]
  distance: number; // in meters
}

const DATA_DIR = path.join(process.cwd(), 'data');
const MODELS_DIR = path.join(DATA_DIR, 'models');

// Helper to ensure directories exist
function ensureDirs() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(MODELS_DIR)) {
    fs.mkdirSync(MODELS_DIR, { recursive: true });
  }
}

// Get directory paths for a model ID
export function getModelDirs(id: string) {
  ensureDirs();
  const modelDir = path.join(MODELS_DIR, id);
  const extractedDir = path.join(modelDir, 'extracted');
  return { modelDir, extractedDir };
}

// Generate human-readable file size
function formatBytes(bytes: number, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// List all models with metadata
export function listModels(): ModelMetadata[] {
  ensureDirs();
  if (!fs.existsSync(MODELS_DIR)) return [];

  const dirs = fs.readdirSync(MODELS_DIR);
  const models: ModelMetadata[] = [];

  for (const id of dirs) {
    const { modelDir } = getModelDirs(id);
    const metaPath = path.join(modelDir, 'metadata.json');
    if (fs.existsSync(metaPath)) {
      try {
        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')) as ModelMetadata;
        models.push(meta);
      } catch (e) {
        console.error(`Failed to parse metadata for model ${id}`, e);
      }
    }
  }

  // Sort by uploadDate descending
  return models.sort((a, b) => new Date(b.uploadDate).getTime() - new Date(a.uploadDate).getTime());
}

// Get metadata for a single model
export function getModelMetadata(id: string): ModelMetadata | null {
  const { modelDir } = getModelDirs(id);
  const metaPath = path.join(modelDir, 'metadata.json');
  if (!fs.existsSync(metaPath)) return null;

  try {
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')) as ModelMetadata;
    return meta;
  } catch (e) {
    console.error(`Failed to read metadata for ${id}`, e);
    return null;
  }
}

// Save metadata for a single model
export function saveModelMetadata(id: string, metadata: ModelMetadata) {
  const { modelDir } = getModelDirs(id);
  if (!fs.existsSync(modelDir)) {
    fs.mkdirSync(modelDir, { recursive: true });
  }
  const metaPath = path.join(modelDir, 'metadata.json');
  fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2), 'utf8');
}

// Get annotations for a model
export function getAnnotations(id: string): Annotation[] {
  const { modelDir } = getModelDirs(id);
  const filePath = path.join(modelDir, 'annotations.json');
  if (!fs.existsSync(filePath)) return [];

  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as Annotation[];
  } catch (e) {
    console.error(`Failed to read annotations for ${id}`, e);
    return [];
  }
}

// Save annotations for a model
export function saveAnnotations(id: string, annotations: Annotation[]) {
  const { modelDir } = getModelDirs(id);
  if (!fs.existsSync(modelDir)) {
    fs.mkdirSync(modelDir, { recursive: true });
  }
  const filePath = path.join(modelDir, 'annotations.json');
  fs.writeFileSync(filePath, JSON.stringify(annotations, null, 2), 'utf8');
}

// Get measurements for a model
export function getMeasurements(id: string): Measurement[] {
  const { modelDir } = getModelDirs(id);
  const filePath = path.join(modelDir, 'measurements.json');
  if (!fs.existsSync(filePath)) return [];

  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as Measurement[];
  } catch (e) {
    console.error(`Failed to read measurements for ${id}`, e);
    return [];
  }
}

// Save measurements for a model
export function saveMeasurements(id: string, measurements: Measurement[]) {
  const { modelDir } = getModelDirs(id);
  if (!fs.existsSync(modelDir)) {
    fs.mkdirSync(modelDir, { recursive: true });
  }
  const filePath = path.join(modelDir, 'measurements.json');
  fs.writeFileSync(filePath, JSON.stringify(measurements, null, 2), 'utf8');
}

// Helper to scan directory recursively for files matching extensions
function findFiles(dir: string, extensions: string[]): string[] {
  let results: string[] = [];
  if (!fs.existsSync(dir)) return results;

  const list = fs.readdirSync(dir);
  for (const file of list) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      results = results.concat(findFiles(fullPath, extensions));
    } else {
      const ext = path.extname(file).toLowerCase();
      if (extensions.includes(ext)) {
        results.push(fullPath);
      }
    }
  }
  return results;
}

// Delete a model and all of its files
export function deleteModel(id: string): boolean {
  const { modelDir } = getModelDirs(id);
  if (fs.existsSync(modelDir)) {
    try {
      fs.rmSync(modelDir, { recursive: true, force: true });
      return true;
    } catch (e) {
      console.error(`Failed to delete model directory ${id}`, e);
      return false;
    }
  }
  return false;
}

// Process uploaded file (GLB or ZIP)
export async function importModel(
  fileName: string,
  buffer: Buffer
): Promise<{ id: string; metadata: ModelMetadata }> {
  ensureDirs();
  const originalId = path.parse(fileName).name.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
  
  // Ensure unique ID
  let id = originalId;
  let counter = 1;
  while (fs.existsSync(path.join(MODELS_DIR, id))) {
    id = `${originalId}-${counter}`;
    counter++;
  }

  const { modelDir, extractedDir } = getModelDirs(id);
  fs.mkdirSync(modelDir, { recursive: true });
  fs.mkdirSync(extractedDir, { recursive: true });

  const ext = path.extname(fileName).toLowerCase();

  let mainModelPath = '';
  let textureFilesFound: string[] = [];
  let textureFilesMissing: string[] = [];

  if (ext === '.glb') {
    // Single GLB file
    const targetPath = path.join(extractedDir, fileName);
    fs.writeFileSync(targetPath, buffer);
    mainModelPath = fileName;
  } else if (ext === '.zip') {
    // ZIP archive
    const zipPath = path.join(modelDir, 'original_upload.zip');
    fs.writeFileSync(zipPath, buffer);

    const zip = new AdmZip(zipPath);
    zip.extractAllTo(extractedDir, true);

    // Scan for 3D model files (.glb, .gltf)
    const modelFiles = findFiles(extractedDir, ['.glb', '.gltf']);
    if (modelFiles.length === 0) {
      // Clean up and error
      fs.rmSync(modelDir, { recursive: true, force: true });
      throw new Error('No valid 3D model file (.glb or .gltf) was found in the archive.');
    }

    // Prefer GLB if both exist, otherwise take first
    const glbFile = modelFiles.find(f => f.endsWith('.glb'));
    const chosenModelFile = glbFile || modelFiles[0];
    
    // Make relative to extractedDir
    mainModelPath = path.relative(extractedDir, chosenModelFile);

    // Look for texture images
    const imageFiles = findFiles(extractedDir, ['.jpg', '.jpeg', '.png', '.webp']);
    textureFilesFound = imageFiles.map(f => path.relative(extractedDir, f));

    // Optional: Parse GLTF to check for missing textures
    if (path.extname(chosenModelFile).toLowerCase() === '.gltf') {
      try {
        const gltfContent = JSON.parse(fs.readFileSync(chosenModelFile, 'utf8'));
        if (gltfContent.images) {
          const referencedImages = gltfContent.images.map((img: any) => img.uri).filter((uri: any) => typeof uri === 'string' && !uri.startsWith('data:'));
          
          for (const ref of referencedImages) {
            // Resolve path relative to the GLTF model path
            const modelFolder = path.dirname(chosenModelFile);
            const refPath = path.resolve(modelFolder, ref);
            if (!fs.existsSync(refPath)) {
              textureFilesMissing.push(ref);
            }
          }
        }
      } catch (e) {
        console.error('Failed to parse GLTF referenced textures', e);
      }
    }
  } else {
    throw new Error('Unsupported file format. Please upload a .glb model or a .zip archive.');
  }

  const modelFullPath = path.join(extractedDir, mainModelPath);
  if (!fs.existsSync(modelFullPath)) {
    throw new Error('The imported model file could not be verified.');
  }

  // Set initial metadata
  const metadata: ModelMetadata = {
    id,
    name: path.parse(fileName).name,
    uploadDate: new Date().toISOString(),
    lastOpenedDate: new Date().toISOString(),
    size: buffer.length,
    fileName,
    modelPath: mainModelPath,
    textureStatus: {
      found: textureFilesFound,
      missing: textureFilesMissing,
      unused: [] // can be derived later
    },
    loadingStatus: textureFilesMissing.length > 0 ? 'Needs attention' : 'Ready',
    scaleStatus: 'unverified',
    scaleRatio: 1.0,
    shareSettings: {
      enabled: false,
      mode: 'view',
      guestsCanAnnotate: true,
      guestsCanMeasure: true
    },
    hasThumbnail: false
  };

  saveModelMetadata(id, metadata);

  // Initialize empty annotations and measurements
  saveAnnotations(id, []);
  saveMeasurements(id, []);

  return { id, metadata };
}
