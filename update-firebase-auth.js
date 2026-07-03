const fs = require('fs');

let content = fs.readFileSync('lib/firebase-auth.ts', 'utf8');

content = content.replace(
  /if \(error\.code !== 'auth\/popup-closed-by-user'\) \{\s*console\.error\('Sign in error:', error\);\s*\}\s*throw error;/g,
  "if (error?.code === 'auth/popup-closed-by-user' || error?.message?.includes('popup-closed-by-user')) {\n      return null;\n    }\n    console.error('Sign in error:', error);\n    throw error;"
);

fs.writeFileSync('lib/firebase-auth.ts', content);
