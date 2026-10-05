// Resolve provider defaults before startup; explicit application settings win.
const resolveRenderEnvironment = (environment) => {
  const resolved = { ...environment };
  if (resolved.RENDER === 'true') {
    if (!resolved.PUBLIC_APP_URL?.trim() && resolved.RENDER_EXTERNAL_URL) {
      resolved.PUBLIC_APP_URL = resolved.RENDER_EXTERNAL_URL;
    }
    if (!resolved.APP_RELEASE_SHA?.trim() && resolved.RENDER_GIT_COMMIT) {
      resolved.APP_RELEASE_SHA = resolved.RENDER_GIT_COMMIT;
    }
  }
  return resolved;
};

module.exports = { resolveRenderEnvironment };
