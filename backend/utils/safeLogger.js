function safeErrorMetadata(error) {
  if (!error || typeof error !== "object") return {};
  const metadata = {};
  if (error.name) metadata.name = String(error.name).slice(0, 100);
  if (error.code) metadata.code = String(error.code).slice(0, 100);
  if (error.constraint) metadata.constraint = String(error.constraint).slice(0, 200);
  if (error.severity) metadata.severity = String(error.severity).slice(0, 50);
  return metadata;
}

function logError(context, error) {
  console.error(String(context || "Server operation failed."), safeErrorMetadata(error));
}

function logInfo(event, metadata = {}) {
  console.log(String(event || "Server event"), metadata);
}

module.exports = { logError, logInfo, safeErrorMetadata };
