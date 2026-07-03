const fs = require('fs');

let content = fs.readFileSync('app/share/[id]/page.tsx', 'utf8');

content = content.replace(
  "import { ModelMetadata, Annotation, Measurement } from '@/lib/storage';",
  "import { ModelMetadata, Annotation, Measurement } from '@/lib/storage';\nimport { getModelMetadata, getAnnotations, getMeasurements, saveAnnotations, saveMeasurements } from '@/lib/firebase-db';"
);

content = content.replace(
  /const res = await fetch\(`\/api\/models\/\$\{id\}`\);\s*if \(\!res\.ok\)\s*throw new Error\('Failed to retrieve model'\);\s*const data = await res\.json\(\);/g,
  "const data = await getModelMetadata(id);\n      if (!data) throw new Error('Failed to retrieve model');"
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
  /const res = await fetch\(`\/api\/models\/\$\{id\}\/authenticate`, \{\s*method: 'POST',\s*headers: \{\s*'Content-Type': 'application\/json'\s*\},\s*body: JSON\.stringify\(\{ password: passwordValue \}\)\s*\}\);\s*if \(\!res\.ok\) \{\s*throw new Error\('Authentication endpoint rejected request\.'\);\s*\}\s*const data = await res\.json\(\);\s*if \(\!data\.success\) \{\s*setAuthError\(data\.error \|\| 'Incorrect password\.'\);\s*\} else \{\s*setIsAuthenticated\(true\);\s*setGuestRole\(data\.mode\);\s*await loadReviewData\(\);\s*\}/g,
  "if (metadata && metadata.shareSettings.password && metadata.shareSettings.password !== passwordValue) {\n        setAuthError('Incorrect password.');\n      } else {\n        setIsAuthenticated(true);\n        setGuestRole(metadata?.shareSettings.mode || 'view');\n        await loadReviewData();\n      }"
);

fs.writeFileSync('app/share/[id]/page.tsx', content);
