const fs = require('fs');

let content = fs.readFileSync('app/page.tsx', 'utf8');

// Add import
content = content.replace(
  "import { googleSignIn, initAuth, getAccessToken } from '@/lib/firebase-auth';",
  "import { googleSignIn, initAuth, getAccessToken } from '@/lib/firebase-auth';\nimport { listModels, importModelClient, deleteModel, saveModelMetadata } from '@/lib/firebase-db';"
);

// fetchModels
content = content.replace(
  /const res = await fetch\("\/api\/models"\);\s*if \(\!res\.ok\) throw new Error\('Failed to load models'\);\s*const data = await res\.json\(\);\s*setModels\(data\);/g,
  "const data = await listModels();\n      setModels(data);"
);

// deleteModel
content = content.replace(
  /const res = await fetch\(`\/api\/models\/\$\{id\}`,\s*\{\s*method: 'DELETE',\s*\}\);/g,
  "await deleteModel(id);"
);
content = content.replace(
  /if \(\!res\.ok\)\s*throw new Error\('Failed to delete model'\);/g,
  ""
);

// handleUpload (form data)
content = content.replace(
  /const formData = new FormData\(\);\s*formData\.append\('file', file\);\s*const res = await fetch\('\/api\/models', \{\s*method: 'POST',\s*body: formData,\s*\}\);\s*if \(!res\.ok\) \{\s*const err = await res\.text\(\);\s*throw new Error\(err \|\| 'Upload failed'\);\s*\}\s*const \{ metadata \} = await res\.json\(\);/g,
  "const buffer = await file.arrayBuffer();\n      const { metadata } = await importModelClient(file.name, buffer);"
);

// share settings (handleSaveShareSettings)
content = content.replace(
  /const res = await fetch\(`\/api\/models\/\$\{activeShareModel\.id\}\/settings`,\s*\{\s*method: 'POST',\s*headers: \{\s*'Content-Type': 'application\/json',\s*\},\s*body: JSON\.stringify\(\{\s*shareSettings:\s*\{[^}]*\}\s*\}\),\s*\}\);/g,
  "const newSettings = {\n        enabled: true,\n        password: passwordInput || undefined,\n        mode: shareMode,\n        guestsCanAnnotate,\n        guestsCanMeasure\n      };\n      await saveModelMetadata(activeShareModel.id, { ...activeShareModel, shareSettings: newSettings as any });"
);

// share settings (handleDisableSharing)
content = content.replace(
  /const res = await fetch\(`\/api\/models\/\$\{activeShareModel\.id\}\/settings`,\s*\{\s*method: 'POST',\s*headers: \{\s*'Content-Type': 'application\/json',\s*\},\s*body: JSON\.stringify\(\{\s*shareSettings: \{\s*enabled: false,\s*password: undefined,\s*mode: 'view',\s*guestsCanAnnotate: false,\s*guestsCanMeasure: false\s*\}\s*\}\),\s*\}\);/g,
  "const newSettings = {\n        enabled: false,\n        password: undefined,\n        mode: 'view' as const,\n        guestsCanAnnotate: false,\n        guestsCanMeasure: false\n      };\n      await saveModelMetadata(activeShareModel.id, { ...activeShareModel, shareSettings: newSettings });"
);

content = content.replace(
  /if \(\!res\.ok\) throw new Error\('Failed to update share settings'\);/g,
  ""
);

fs.writeFileSync('app/page.tsx', content);
