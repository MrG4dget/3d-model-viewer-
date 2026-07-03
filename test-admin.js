const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const config = require('./firebase-applet-config.json');

initializeApp({
  projectId: config.projectId,
  storageBucket: config.storageBucket
});

const db = getFirestore();
db.collection('test').get().then(snap => {
  console.log('Docs count:', snap.size);
}).catch(e => console.error(e));
