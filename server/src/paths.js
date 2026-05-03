const path = require('path');

const isPkg = typeof process.pkg !== 'undefined';

// When running as a pkg exe, store data next to the exe.
// When running as plain node, use the project root (2KBridge/).
const ROOT_DIR = isPkg
  ? path.dirname(process.execPath)
  : path.join(__dirname, '../..');

const SERVER_DIR = isPkg
  ? path.dirname(process.execPath)
  : path.join(__dirname, '..');

module.exports = {
  DOT_ENV:  path.join(SERVER_DIR, '.env'),
  DATA_DIR: path.join(ROOT_DIR, 'data'),
};
