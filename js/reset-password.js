(function initializeResetPassword(globalScope) {
  "use strict";
  if (typeof document === "undefined") return;

  document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("resetPasswordForm");
    const feedback = document.getElementById("resetFeedback");
    const token = new URLSearchParams(globalScope.location.search).get("token") || "";

    function showFeedback(message, type = "error") {
      feedback.textContent = message;
      feedback.className = `auth-feedback ${type}`;
      feedback.focus();
    }

    document.querySelectorAll("[data-password-target]").forEach((button) => {
      button.addEventListener("click", () => {
        const input = document.getElementById(button.dataset.passwordTarget);
        const showing = input.type === "text";
        input.type = showing ? "password" : "text";
        button.textContent = showing ? "Show" : "Hide";
      });
    });

    if (!token) {
      form.querySelector('[type="submit"]').disabled = true;
      showFeedback("This password reset link is invalid or incomplete.");
    }

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const password = document.getElementById("newPassword").value;
      const passwordConfirm = document.getElementById("confirmNewPassword").value;
      if (password.length < 8) return showFeedback("Password must be at least 8 characters.");
      if (password !== passwordConfirm) return showFeedback("Passwords do not match.");
      const submit = form.querySelector('[type="submit"]');
      submit.disabled = true;
      submit.textContent = "Resetting…";
      try {
        const response = await globalScope.apiFetch(`${globalScope.BASE_URL}/auth/reset-password`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, password, passwordConfirm }),
        });
        let data = {};
        try { data = await response.json(); } catch (_) {}
        if (!response.ok) throw new Error(data.error || "Password could not be reset.");
        form.reset();
        showFeedback(data.message || "Password reset successful.", "success");
        globalScope.setTimeout(() => globalScope.location.replace("login.html?reset=success"), 1200);
      } catch (error) {
        showFeedback(error.message === "Failed to fetch" ? "Cannot reach the authentication server." : error.message);
        submit.disabled = false;
        submit.textContent = "Reset Password";
      }
    });
  });
})(typeof window !== "undefined" ? window : globalThis);
