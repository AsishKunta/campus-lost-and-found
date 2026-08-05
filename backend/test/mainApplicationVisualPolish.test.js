const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "../..");
const html = fs.readFileSync(path.join(root, "dashboard.html"), "utf8");
const css = fs.readFileSync(path.join(root, "css/modern.css"), "utf8");
const router = fs.readFileSync(path.join(root, "js/router.js"), "utf8");

test("main application palette aligns with the isolated authentication design", () => {
  assert.match(css, /--ui-navy:\s*#153f35/);
  assert.match(css, /--ui-blue:\s*#176b52/);
  assert.match(css, /--ui-bg:\s*#f2f6f4/);
  assert.match(css, /--ui-border:\s*#d7e2dd/);
});

test("shared sidebar is modestly wider and retains mobile behavior", () => {
  assert.match(css, /--ui-sidebar:\s*272px/);
  assert.match(css, /@media \(max-width: 1100px\)[\s\S]*--ui-sidebar:\s*240px/);
  assert.match(css, /@media \(max-width: 768px\)[\s\S]*\.sidebar-welcome\s*\{\s*display:\s*none/);
});

test("sidebar welcome is presentation-only and role responsive", () => {
  assert.match(html, /id="sidebarWelcomeName"/);
  assert.match(html, /id="sidebarWelcomeWorkspace"/);
  assert.match(router, /renderSidebarWelcome\(role\)/);
  assert.match(router, /role === 'admin' \? 'Admin Workspace' : 'Student Workspace'/);
  assert.match(router, /getCurrentUser\(\)/);
  assert.doesNotMatch(router, /auth\/login|auth\/signup/);
});

test("sidebar welcome vertically fills flexible space without moving the footer", () => {
  assert.match(html, /class="sidebar-welcome-avatar"/);
  assert.match(html, /Helping lost things find their way home\./);
  assert.match(css, /\.sidebar-nav\s*\{\s*flex:\s*0 1 auto/);
  assert.match(css, /\.sidebar-welcome\s*\{[\s\S]*flex:\s*1 1 auto;[\s\S]*flex-direction:\s*column;[\s\S]*justify-content:\s*center/);
  assert.match(css, /@media \(max-height: 760px\) and \(min-width: 769px\)/);
});
