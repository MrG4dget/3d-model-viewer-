import { NextResponse } from 'next/server';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import config from '../../../firebase-applet-config.json' with { type: "json" };

const app = !getApps().length ? initializeApp(config) : getApp();
const storage = getStorage(app);

export async function GET() {
  try {
    const r = ref(storage, 'test.txt');
    const enc = new TextEncoder();
    await uploadBytes(r, enc.encode("Hello World"));
    const url = await getDownloadURL(r);
    return NextResponse.json({ ok: true, url });
  } catch(e: any) {
    return NextResponse.json({ ok: false, error: e.message });
  }
}
