const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "../..");
const html = fs.readFileSync(path.join(root, "login.html"), "utf8");
const dashboardHtml = fs.readFileSync(path.join(root, "dashboard.html"), "utf8");
const css = fs.readFileSync(path.join(root, "css/auth.css"), "utf8");
const authUi = require(path.join(root, "js/login.js"));

test("temporary development domains map to exact workspace labels", () => {
  assert.equal(authUi.detectDemoWorkspace("sun04@student.com"), "Student");
  assert.equal(authUi.detectDemoWorkspace("staff01@admin.com"), "Admin");
  assert.equal(authUi.detectDemoWorkspace("user@gmail.com"), null);
  assert.equal(authUi.detectDemoWorkspace("user@admin.com.fake"), null);
  assert.equal(authUi.detectDemoWorkspace("user@student.com.fake"), null);
});

test("authentication validation covers required and malformed input", () => {
  assert.equal(authUi.validateLogin({ email: "", password: "" }), "Enter a valid email address.");
  assert.match(authUi.validateLogin({ email: "user@gmail.com", password: "password" }), /development environment/);
  assert.equal(authUi.validateSignup({ name: "Student", email: "sun04@student.com", password: "password", passwordConfirm: "different" }), "Passwords do not match.");
  assert.match(authUi.validateSignup({ name: "Student", email: "sun04@student.com", password: "short", passwordConfirm: "short" }), /at least 8/);
});

test("authentication page integrates through one canonical user cache and dashboard redirect", () => {
  assert.doesNotMatch(html, /http-equiv="refresh"/);
  assert.doesNotMatch(html, /window\.location/);
  const source = fs.readFileSync(path.join(root, "js/login.js"), "utf8");
  assert.match(source, /cacheAuthenticatedUser/);
  assert.match(source, /location\.replace\("dashboard\.html#dashboard"\)/);
  assert.doesNotMatch(source, /auth\/workspace/);
  assert.match(source, /Array\.isArray\(data\.user\.roles\)/);
  assert.doesNotMatch(html, /Dashboard integration is intentionally disabled/);
});

test("sign-in and sign-up expose accessible responsive controls", () => {
  assert.match(html, /id="signupPasswordConfirm"/);
  assert.match(html, /role="tablist"/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /data-password-target="loginPassword"/);
  assert.match(html, /type="checkbox" id="rememberMe" name="rememberMe"/);
  assert.match(html, /<span>Remember me<\/span>/);
  assert.match(fs.readFileSync(path.join(root, "js/login.js"), "utf8"), /rememberMe: document\.getElementById\("rememberMe"\)\.checked/);
  assert.match(css, /@media \(max-width: 820px\)/);
  assert.match(css, /:focus-visible/);
});

test("login DOM initialization selectors match the page and runtime config cannot corrupt parsing", () => {
  const source = fs.readFileSync(path.join(root, "js/login.js"), "utf8");
  const selectorIds = [...source.matchAll(/getElementById\("([^"]+)"\)/g)].map((match) => match[1]);

  for (const id of new Set(selectorIds)) {
    assert.match(html, new RegExp(`id=["']${id}["']`), `login.html must provide #${id}`);
  }

  assert.match(html, /document\.write\('<script src="\/api\/runtime-config\.js"><\\\/script>'\)/);
  assert.doesNotMatch(html, /<\\\\\/script>/);
  assert.match(source, /loginTab\?\.addEventListener/);
  assert.match(source, /signupTab\?\.addEventListener/);
  assert.match(source, /forgotPasswordLink\?\.addEventListener/);
  assert.match(source, /backToLogin\?\.addEventListener/);
});

test("dashboard runtime configuration script closes without corrupting the application shell", () => {
  assert.match(dashboardHtml, /document\.write\('<script src="\/api\/runtime-config\.js"><\\\/script>'\)/);
  assert.doesNotMatch(dashboardHtml, /<\\\\\/script>/);
  assert.match(dashboardHtml, /<html lang="en" class="auth-pending">/);
});
