const { readFile, writeFile } = require('fs/promises');

const path = 'build/poy.js';

(async () => {
    const src = (await readFile(path, 'utf-8')).toString();
    await writeFile(path, `#!/usr/bin/env node\n${src}`);
})();