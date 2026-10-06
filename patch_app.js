const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

code = code.replace(/const data = await response\.json\(\);/g, `
      const contentType = response.headers.get("content-type");
      let data;
      if (contentType && contentType.indexOf("application/json") !== -1) {
        data = await response.json();
      } else {
        const text = await response.text();
        throw new Error("Server returned an unexpected response (not JSON). Please try again or check if the file is too large.");
      }
`);

fs.writeFileSync('src/App.tsx', code);
