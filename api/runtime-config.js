module.exports = function runtimeConfig(_request, response) {
  const apiUrl = String(process.env.BACKEND_API_URL || "").replace(/\/$/, "");
  response.setHeader("Content-Type", "application/javascript; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.status(200).send(
    `window.CAMPUS_API_BASE_URL=${JSON.stringify(apiUrl)};`
  );
};
