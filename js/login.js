(function authUiModule(globalScope) {
  "use strict";

  const SUPPORTED_DOMAINS = Object.freeze({
    "student.com": "Student",
    "admin.com": "Admin",
  });
  const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const MIN_PASSWORD_LENGTH = 8;

  function normalizeEmail(value) {
    return String(value || "").trim().toLowerCase();
  }

  function detectDemoWorkspace(email) {
    const normalized = normalizeEmail(email);
    if (!EMAIL_PATTERN.test(normalized)) return null;
    return SUPPORTED_DOMAINS[normalized.split("@").pop()] || null;
  }

  function validateEmail(email) {
    const normalized = normalizeEmail(email);
    if (!normalized || !EMAIL_PATTERN.test(normalized)) return "Enter a valid email address.";
    if (!detectDemoWorkspace(normalized)) {
      return "Please use a @student.com or @admin.com email for this development environment.";
    }
    return "";
  }

  function validateLogin({ email, password }) {
    const emailError = validateEmail(email);
    if (emailError) return emailError;
    if (!password) return "Password is required.";
    return "";
  }

  function validateSignup({ name, email, password, passwordConfirm }) {
    if (!String(name || "").trim()) return "Full name is required.";
    const emailError = validateEmail(email);
    if (emailError) return emailError;
    if (!password) return "Password is required.";
    if (password.length < MIN_PASSWORD_LENGTH) return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
    if (password !== passwordConfirm) return "Passwords do not match.";
    return "";
  }

  function validateForgotPassword({ email }) {
    const normalized = normalizeEmail(email);
    return !normalized || !EMAIL_PATTERN.test(normalized) ? "Enter a valid email address." : "";
  }

  const exported = { detectDemoWorkspace, normalizeEmail, validateEmail, validateForgotPassword, validateLogin, validateSignup };
  if (typeof module !== "undefined" && module.exports) module.exports = exported;
  if (typeof document === "undefined") return;

  document.addEventListener("DOMContentLoaded", async function initializeAuthUi() {
    const loginForm = document.getElementById("loginForm");
    const signupForm = document.getElementById("signupForm");
    const forgotPasswordForm = document.getElementById("forgotPasswordForm");
    const forgotPasswordLink = document.getElementById("forgotPasswordLink");
    const backToLogin = document.getElementById("backToLogin");
    const loginTab = document.getElementById("loginTab");
    const signupTab = document.getElementById("signupTab");
    const formTitle = document.getElementById("formTitle");
    const formDescription = document.getElementById("formDescription");
    const feedback = document.getElementById("authFeedback");
    let activeMode = "login";
    let requestInFlight = false;

    function setFeedback(message, type = "error") {
      if (!feedback) return;
      feedback.textContent = message;
      feedback.className = `auth-feedback ${type}`;
      feedback.focus();
    }

    function clearFeedback() {
      if (!feedback) return;
      feedback.textContent = "";
      feedback.className = "auth-feedback hidden";
    }

    function setMode(mode) {
      activeMode = mode;
      clearFeedback();
      loginForm?.classList.toggle("hidden", mode !== "login");
      signupForm?.classList.toggle("hidden", mode !== "signup");
      forgotPasswordForm?.classList.toggle("hidden", mode !== "forgot");
      loginTab?.classList.toggle("active", mode === "login");
      signupTab?.classList.toggle("active", mode === "signup");
      loginTab?.setAttribute("aria-selected", String(mode === "login"));
      signupTab?.setAttribute("aria-selected", String(mode === "signup"));
      if (formTitle) {
        formTitle.textContent = mode === "login"
          ? "Welcome back"
          : mode === "signup" ? "Create your account" : "Reset your password";
      }
      if (formDescription) {
        formDescription.textContent = mode === "login"
          ? "Sign in to continue to Campus Recovery."
          : mode === "signup"
            ? "Create a development account for Campus Recovery."
            : "Enter your email and we’ll send a secure, single-use reset link.";
      }
      document.title = `${mode === "login" ? "Sign In" : mode === "signup" ? "Sign Up" : "Forgot Password"} | Campus Lost & Found`;
    }

    function setLoading(form, loading) {
      requestInFlight = loading;
      const button = form.querySelector('[type="submit"]');
      if (!button) return;
      button.disabled = loading;
      button.textContent = loading
        ? (activeMode === "login" ? "Signing in…" : activeMode === "signup" ? "Creating account…" : "Sending…")
        : (activeMode === "login" ? "Sign In" : activeMode === "signup" ? "Create Account" : "Send Reset Link");
      form.setAttribute("aria-busy", String(loading));
    }

    function cacheUser(user) {
      if (typeof globalScope.cacheAuthenticatedUser === "function") {
        return globalScope.cacheAuthenticatedUser(user);
      }
      const canonicalUser = {
        ...user,
        email: normalizeEmail(user?.email),
        displayName: String(user?.name || user?.displayName || "").trim(),
      };
      localStorage.setItem("currentUser", JSON.stringify(canonicalUser));
      localStorage.setItem("sessionEmail", canonicalUser.email);
      localStorage.setItem("role", canonicalUser.preferredWorkspace || canonicalUser.role || "student");
      return canonicalUser;
    }

    async function parseResponse(response) {
      try { return await response.json(); } catch (_) { return {}; }
    }

    loginTab?.addEventListener("click", () => setMode("login"));
    signupTab?.addEventListener("click", () => setMode("signup"));
    forgotPasswordLink?.addEventListener("click", () => {
      const forgotPasswordEmail = document.getElementById("forgotPasswordEmail");
      const loginEmail = document.getElementById("loginEmail");
      if (!forgotPasswordEmail) return;
      forgotPasswordEmail.value = loginEmail?.value || "";
      setMode("forgot");
      forgotPasswordEmail.focus();
    });
    backToLogin?.addEventListener("click", () => setMode("login"));
    document.querySelectorAll("[data-password-target]").forEach((button) => {
      button.addEventListener("click", () => {
        const input = document.getElementById(button.dataset.passwordTarget);
        if (!input) return;
        const showing = input.type === "text";
        input.type = showing ? "password" : "text";
        button.textContent = showing ? "Show" : "Hide";
        button.setAttribute("aria-label", `${showing ? "Show" : "Hide"} password`);
      });
    });

    signupForm?.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (requestInFlight) return;
      const input = {
        name: document.getElementById("signupName").value.trim(),
        email: normalizeEmail(document.getElementById("signupEmail").value),
        password: document.getElementById("signupPassword").value,
        passwordConfirm: document.getElementById("signupPasswordConfirm").value,
      };
      const validationError = validateSignup(input);
      if (validationError) return setFeedback(validationError);

      setLoading(signupForm, true);
      clearFeedback();
      try {
        const response = await globalScope.apiFetch(`${globalScope.BASE_URL}/auth/signup`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: input.name, email: input.email, password: input.password }),
        });
        const data = await parseResponse(response);
        if (!response.ok) throw new Error(data.error || "Account creation failed. Please try again.");
        const expectedRole = detectDemoWorkspace(input.email).toLowerCase();
        if (!data.user?.roles?.includes(expectedRole)) {
          throw new Error("The development account role could not be assigned. Please contact the project administrator.");
        }
        setMode("login");
        document.getElementById("loginEmail").value = input.email;
        signupForm.reset();
        setFeedback("Account created successfully. Sign in to continue.", "success");
        document.getElementById("loginPassword").focus();
      } catch (error) {
        setFeedback(error.message === "Failed to fetch" ? "Cannot reach the authentication server. Please try again when it is running." : error.message);
      } finally {
        setLoading(signupForm, false);
      }
    });

    loginForm?.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (requestInFlight) return;
      const input = {
        email: normalizeEmail(document.getElementById("loginEmail").value),
        password: document.getElementById("loginPassword").value,
        rememberMe: document.getElementById("rememberMe").checked,
      };
      const validationError = validateLogin(input);
      if (validationError) return setFeedback(validationError);

      setLoading(loginForm, true);
      clearFeedback();
      try {
        const response = await globalScope.apiFetch(`${globalScope.BASE_URL}/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        });
        const data = await parseResponse(response);
        if (!response.ok) throw new Error(data.error || "Invalid email or password.");
        if (!data.user || !Array.isArray(data.user.roles)) {
          throw new Error("The server did not return an authorized workspace.");
        }
        cacheUser(data.user);
        globalScope.location.replace("dashboard.html#dashboard");
      } catch (error) {
        setFeedback(error.message === "Failed to fetch" ? "Cannot reach the authentication server. Please try again when it is running." : error.message);
      } finally {
        setLoading(loginForm, false);
      }
    });

    forgotPasswordForm?.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (requestInFlight) return;
      const input = { email: normalizeEmail(document.getElementById("forgotPasswordEmail").value) };
      const validationError = validateForgotPassword(input);
      if (validationError) return setFeedback(validationError);
      setLoading(forgotPasswordForm, true);
      clearFeedback();
      try {
        const response = await globalScope.apiFetch(`${globalScope.BASE_URL}/auth/forgot-password`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        });
        const data = await parseResponse(response);
        if (!response.ok) throw new Error(data.error || "Password reset could not be requested.");
        forgotPasswordForm.reset();
        setFeedback(data.message || "If an account exists for that email, a password reset link will be sent.", "success");
      } catch (error) {
        setFeedback(error.message === "Failed to fetch" ? "Cannot reach the authentication server." : error.message);
      } finally {
        setLoading(forgotPasswordForm, false);
      }
    });

    setMode("login");
    try {
      const sessionResponse = await globalScope.apiFetch(`${globalScope.BASE_URL}/auth/me`);
      if (sessionResponse.ok) {
        const sessionData = await parseResponse(sessionResponse);
        if (sessionData.user && !sessionData.user.developmentBypass) {
          cacheUser(sessionData.user);
          globalScope.location.replace("dashboard.html#dashboard");
        }
      }
    } catch (_) {
      // The form remains available when there is no valid interactive session.
    }
  });
})(typeof window !== "undefined" ? window : globalThis);
