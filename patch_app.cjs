const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

// Replace all occurrences safely
code = code.replace(/const data = await response\.json\(\);/g, `
      let data;
      try {
        data = await response.json();
      } catch (e) {
        throw new Error("Server returned an invalid response (not JSON). The files may be too large or the server timed out.");
      }
`);

fs.writeFileSync('src/App.tsx', code);
