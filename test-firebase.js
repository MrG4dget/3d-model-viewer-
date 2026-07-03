import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import { getStorage, ref, uploadBytes } from 'firebase/storage';
import { readFileSync } from 'fs';
import config from './firebase-applet-config.json' assert { type: "json" };

const app = initializeApp(config);
const db = getFirestore(app);
const storage = getStorage(app);

async function run() {
  try {
    const docs = await getDocs(collection(db, 'test'));
    console.log('Firestore connected, docs count:', docs.size);
  } catch (e) {
    console.error('Firestore error:', e);
  }
}
run();
