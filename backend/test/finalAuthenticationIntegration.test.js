const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "../..");
const login = fs.readFileSync(path.join(root, "js/login.js"), "utf8");
const common = fs.readFileSync(path.join(root, "js/common.js"), "utf8");
const context = fs.readFileSync(path.join(root, "js/userContext.js"), "utf8");
const router = fs.readFileSync(path.join(root, "js/router.js"), "utf8");
const profile = fs.readFileSync(path.join(root, "js/profile.js"), "utf8");
const css = fs.readFileSync(path.join(root, "css/modern.css"), "utf8");
const vercel = fs.readFileSync(path.join(root, "vercel.json"), "utf8");

test("production entry, authenticated redirect, refresh, and logout form a closed routing loop", () => {
  assert.match(vercel, /"source": "\/"[\s\S]*"destination": "\/login\.html"/);
  assert.match(login, /auth\/me/);
  assert.match(login, /sessionResponse\.ok[\s\S]*location\.replace\("dashboard\.html#dashboard"\)/);
  assert.match(common, /auth\/me[\s\S]*classList\.remove\("auth-pending"\)/);
  assert.match(common, /auth\/logout[\s\S]*clearBrowserIdentity\(\)[\s\S]*location\.href = "login\.html"/);
});

test("successful login selects a server-assigned workspace and enters the existing shell", () => {
  assert.match(login, /Array\.isArray\(data\.user\.roles\)/);
  assert.doesNotMatch(login, /desiredWorkspace|auth\/workspace/);
  assert.match(login, /cacheUser\(data\.user\)/);
  assert.match(login, /dashboard\.html#dashboard/);
});

test("dashboard direct access requires a real interactive server session", () => {
  assert.match(common, /data\.user\?\.developmentBypass/);
  assert.match(common, /clearBrowserIdentity\(\)/);
  assert.match(common, /window\.location\.href = "login\.html"/);
  assert.doesNotMatch(common, /Local Development User|development-user@campus\.local/);
});

test("local API hostname follows the frontend hostname for SameSite sessions", () => {
  assert.match(common, /LOCAL_API_HOSTS = \["localhost", "127\.0\.0\.1"\]/);
  assert.match(common, /window\.location\.hostname/);
  assert.match(common, /`http:\/\/\$\{window\.location\.hostname\}:3001`/);
  assert.match(common, /CAMPUS_API_BASE_URL/);
});

test("sidebar and Profile use the same canonical authenticated identity", () => {
  assert.match(common, /function cacheAuthenticatedUser/);
  assert.match(context, /displayName:/);
  assert.match(router, /getCurrentUser\(\)/);
  assert.match(profile, /auth\/me/);
  assert.match(profile, /user\.name/);
});

test("logout revokes the session, clears identity, and returns to sign in", () => {
  assert.match(common, /auth\/logout/);
  assert.match(common, /clearBrowserIdentity\(\)/);
  assert.match(common, /window\.location\.href = "login\.html"/);
});

test("welcome composition keeps horizontal text distributed through flexible height", () => {
  assert.match(css, /\.sidebar-welcome\s*\{[\s\S]*flex-direction:\s*column/);
  assert.match(css, /\.sidebar-welcome-label\s*\{\s*transform:\s*translateX/);
  assert.doesNotMatch(css, /writing-mode|rotate\(/);
  assert.match(css, /\.sidebar-welcome\s*\{[\s\S]*background:\s*transparent/);
});
