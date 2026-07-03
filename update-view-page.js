const fs = require('fs');

let content = fs.readFileSync('app/view/[id]/page.tsx', 'utf8');

content = content.replace(
  "import { ModelMetadata, Annotation, Measurement } from '@/lib/storage';",
  "import { ModelMetadata, Annotation, Measurement } from '@/lib/storage';\nimport { getModelMetadata, getAnnotations, getMeasurements, saveAnnotations, saveMeasurements, saveModelMetadata } from '@/lib/firebase-db';"
);

content = content.replace(
  /const metaRes = await fetch\(`\/api\/models\/\$\{id\}`\);\s*if \(\!metaRes\.ok\) throw new Error\('Model metadata not found'\);\s*const metaData = await metaRes\.json\(\);/g,
  "const metaData = await getModelMetadata(id);\n      if (!metaData) throw new Error('Model metadata not found');"
);

content = content.replace(
  /const annRes = await fetch\(`\/api\/models\/\$\{id\}\/annotations`\);\s*if \(annRes\.ok\) \{\s*const annData = await annRes\.json\(\);\s*setAnnotations\(annData\);\s*\}/g,
  "const annData = await getAnnotations(id);\n      setAnnotations(annData);"
);

content = content.replace(
  /const measRes = await fetch\(`\/api\/models\/\$\{id\}\/measurements`\);\s*if \(measRes\.ok\) \{\s*const measData = await measRes\.json\(\);\s*setMeasurements\(measData\);\s*\}/g,
  "const measData = await getMeasurements(id);\n      setMeasurements(measData);"
);

content = content.replace(
  /await fetch\(`\/api\/models\/\$\{id\}\/annotations`, \{\s*method: 'POST',\s*headers: \{\s*'Content-Type': 'application\/json'\s*\},\s*body: JSON\.stringify\(updatedAnnotations\),\s*\}\);/g,
  "await saveAnnotations(id, updatedAnnotations);"
);

content = content.replace(
  /await fetch\(`\/api\/models\/\$\{id\}\/measurements`, \{\s*method: 'POST',\s*headers: \{\s*'Content-Type': 'application\/json'\s*\},\s*body: JSON\.stringify\(updatedMeasurements\),\s*\}\);/g,
  "await saveMeasurements(id, updatedMeasurements);"
);

content = content.replace(
  /const res = await fetch\(`\/api\/models\/\$\{id\}\/settings`, \{\s*method: 'POST',\s*headers: \{\s*'Content-Type': 'application\/json'\s*\},\s*body: JSON\.stringify\(updatedFields\),\s*\}\);\s*if \(res\.ok\) \{\s*const data = await res\.json\(\);\s*setMetadata\(data\.metadata\);\s*\}/g,
  "await saveModelMetadata(id, newMetadata);\n      setMetadata(newMetadata);"
);

fs.writeFileSync('app/view/[id]/page.tsx', content);
