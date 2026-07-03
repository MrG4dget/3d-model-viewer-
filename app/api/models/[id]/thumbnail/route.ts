import { NextResponse } from 'next/server';
import { storage } from '@/lib/firebase-db';
import { ref, getBytes, uploadString } from 'firebase/storage';
import { getModelMetadata, saveModelMetadata } from '@/lib/firebase-db';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  
  try {
    const fileRef = ref(storage, `models/${id}/thumbnail.png`);
    const arrayBuffer = await getBytes(fileRef);
    return new NextResponse(arrayBuffer, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=86400'
      }
    });
  } catch(e) {
    return new NextResponse('Thumbnail not found', { status: 404 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const body = await request.json();
    const { image } = body; // base64 string
    
    if (!image) {
      return NextResponse.json({ error: 'No image data provided' }, { status: 400 });
    }
    
    const fileRef = ref(storage, `models/${id}/thumbnail.png`);
    await uploadString(fileRef, image, 'data_url');
    
    const metadata = await getModelMetadata(id);
    if (metadata) {
      await saveModelMetadata(id, { ...metadata, hasThumbnail: true });
    }
    
    return NextResponse.json({ success: true });
  } catch(e: any) {
    console.error('Failed to save thumbnail', e);
    return NextResponse.json({ error: 'Failed to save thumbnail' }, { status: 500 });
  }
}
