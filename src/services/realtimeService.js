let ioInstance = null;

function setIO(io) {
  ioInstance = io || null;
}

function getIO() {
  return ioInstance;
}

module.exports = { setIO, getIO };
