const fs = require('fs');
let content = fs.readFileSync('components/ThreeViewer.tsx', 'utf8');

// replace the thumbnail fetch
content = content.replace(
  /const res = await fetch\(`\/api\/models\/\$\{id\}\/thumbnail`, \{\s*method: 'POST',\s*headers: \{\s*'Content-Type': 'application\/json'\s*\},\s*body: JSON\.stringify\(\{ imageData \}\)\s*\}\);/g,
  "import { storage, saveModelMetadata } from '@/lib/firebase-db';\n      import { ref, uploadString } from 'firebase/storage';\n      const r = ref(storage, `models/${id}/thumbnail.png`);\n      await uploadString(r, imageData, 'data_url');\n      await saveModelMetadata(id, { ...metadata, hasThumbnail: true });"
);

// We need to also add imports for storage and getDownloadURL, but wait, my replace might insert it in the middle of a function.
// Let's just do it cleanly using multi_edit_file or sed.

fs.writeFileSync('components/ThreeViewer.tsx', content);
