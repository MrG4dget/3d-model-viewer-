import { NextResponse } from 'next/server';
import { ref, getBytes } from 'firebase/storage';
import { storage } from '@/lib/firebase-db';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; path: string[] }> }
) {
  const { id, path: filePathArr } = await params;
  
  if (!filePathArr || filePathArr.length === 0) {
    return new NextResponse('File path not provided', { status: 400 });
  }

  const filePath = `models/${id}/extracted/${filePathArr.join('/')}`;
  const fileRef = ref(storage, filePath);
  
  try {
    const arrayBuffer = await getBytes(fileRef);
    
    // basic mime mapping
    const ext = filePath.split('.').pop()?.toLowerCase();
    let contentType = 'application/octet-stream';
    if (ext === 'gltf') contentType = 'model/gltf+json';
    if (ext === 'glb') contentType = 'model/gltf-binary';
    if (ext === 'png') contentType = 'image/png';
    if (ext === 'jpg' || ext === 'jpeg') contentType = 'image/jpeg';
    if (ext === 'webp') contentType = 'image/webp';
    if (ext === 'bin') contentType = 'application/octet-stream';
    
    return new NextResponse(arrayBuffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable'
      }
    });
  } catch(e) {
    console.error('File proxy error:', e);
    return new NextResponse('File not found in storage', { status: 404 });
  }
}
