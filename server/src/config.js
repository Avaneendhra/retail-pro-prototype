/** Reads settings from environment variables (process.env on Node, bindings on Cloudflare). */
export function readConfig(env) {
  const jwtSecret = env.JWT_SECRET;
  if (!jwtSecret || jwtSecret.length < 32) {
    throw new Error('JWT_SECRET must be set to a random string of at least 32 characters');
  }
  return {
    jwtSecret,
    allowedOrigins: (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean),
    signupCode: env.SIGNUP_CODE || null,
    version: env.APP_VERSION || '1.0.0',
  };
}
