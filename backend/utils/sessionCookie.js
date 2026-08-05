function sessionCookieOptions(config, expiresAt) {
  const maxAge = Math.max(0, new Date(expiresAt).getTime() - Date.now());
  return {
    httpOnly: true,
    secure: config.secureCookies,
    sameSite: config.sameSite || "lax",
    path: "/",
    expires: expiresAt,
    maxAge,
  };
}

function clearSessionCookieOptions(config) {
  return {
    httpOnly: true,
    secure: config.secureCookies,
    sameSite: config.sameSite || "lax",
    path: "/",
  };
}

module.exports = { clearSessionCookieOptions, sessionCookieOptions };
