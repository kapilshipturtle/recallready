// Turns an error into a resolver result. The one exception is Forge's user-consent error:
// it must reach the platform, which then shows the "Allow access" prompt.
export function resultFromError(error) {
  if (error && error.name === 'NEEDS_AUTHENTICATION_ERR') throw error;
  return { ok: false, message: String(error?.message || error) };
}

// Does this error from the Assets workspace endpoint mean "this site has no Assets"?
// The consent error also carries status 401, so it is re-thrown first.
export function isMissingAssets(error) {
  if (error && error.name === 'NEEDS_AUTHENTICATION_ERR') throw error;
  return [401, 403, 404].includes(error?.status);
}
