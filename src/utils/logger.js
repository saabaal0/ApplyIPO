function now() {
  return new Date().toISOString();
}

function info(msg) {
  console.log(`[${now()}] ${msg}`);
}

function warn(msg) {
  console.warn(`[${now()}] WARN: ${msg}`);
}

function error(msg) {
  console.error(`[${now()}] ERROR: ${msg}`);
}

module.exports = { info, warn, error };
