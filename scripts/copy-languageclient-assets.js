const fs = require('fs');
const path = require('path');

const source = path.resolve(
    __dirname,
    '../gclient/node_modules/vscode-languageclient/lib/node/terminateProcess.sh'
);
const destination = path.resolve(
    __dirname,
    '../gclient/out/terminateProcess.sh'
);

fs.mkdirSync(path.dirname(destination), { recursive: true });
fs.copyFileSync(source, destination);
fs.chmodSync(destination, 0o755);
