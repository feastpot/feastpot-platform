// One build-time policy for postbuild, response headers and page metadata.
function isNonReleaseBuild(env = process.env) {
  if (env.VERCEL_ENV) return ['preview', 'development'].includes(env.VERCEL_ENV);
  return env.GITHUB_ACTIONS === 'true' && env.CI === 'true';
}

function isIndexingDisabled(env = process.env) {
  const mode = env.FEASTPOT_RELEASE_MODE || 'launch';
  if (!['launch', 'prelaunch'].includes(mode)) {
    throw new Error('[release] FEASTPOT_RELEASE_MODE must be launch or prelaunch');
  }
  return mode === 'prelaunch' || isNonReleaseBuild(env);
}

module.exports = { isNonReleaseBuild, isIndexingDisabled };
