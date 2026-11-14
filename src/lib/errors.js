// Turns an error into a resolver result. The one exception is Forge's user-consent error:
// it must reach the platform, which then shows the "Allow access" prompt.
export function resultFromError(error) {
  if (error && error.name === 'NEEDS_AUTHENTICATION_ERR') throw error;
  return { ok: false, message: String(error?.message || error) };
}
