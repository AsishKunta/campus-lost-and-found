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

  const exported = { detectDemoWorkspace, normalizeEmail, validateEmail, validateLogin, validateSignup };
  if (typeof module !== "undefined" && module.exports) module.exports = exported;
  if (typeof document === "undefined") return;

  document.addEventListener("DOMContentLoaded", async function initializeAuthUi() {
    const loginForm = document.getElementById("loginForm");
    const signupForm = document.getElementById("signupForm");
    const loginTab = document.getElementById("loginTab");
    const signupTab = document.getElementById("signupTab");
    const formTitle = document.getElementById("formTitle");
    const formDescription = document.getElementById("formDescription");
    const feedback = document.getElementById("authFeedback");
    let activeMode = "login";
    let requestInFlight = false;

    function setFeedback(message, type = "error") {
      feedback.textContent = message;
      feedback.className = `auth-feedback ${type}`;
      feedback.focus();
    }

    function clearFeedback() {
      feedback.textContent = "";
      feedback.className = "auth-feedback hidden";
    }

    function setMode(mode) {
      activeMode = mode;
      clearFeedback();
      loginForm.classList.toggle("hidden", mode !== "login");
      signupForm.classList.toggle("hidden", mode !== "signup");
      loginTab.classList.toggle("active", mode === "login");
      signupTab.classList.toggle("active", mode === "signup");
      loginTab.setAttribute("aria-selected", String(mode === "login"));
      signupTab.setAttribute("aria-selected", String(mode === "signup"));
      formTitle.textContent = mode === "login" ? "Welcome back" : "Create your account";
      formDescription.textContent = mode === "login"
        ? "Sign in to continue to Campus Recovery."
        : "Create a development account for Campus Recovery.";
      document.title = `${mode === "login" ? "Sign In" : "Sign Up"} | Campus Lost & Found`;
    }

    function setLoading(form, loading) {
      requestInFlight = loading;
      const button = form.querySelector('[type="submit"]');
      button.disabled = loading;
      button.textContent = loading
        ? (activeMode === "login" ? "Signing in…" : "Creating account…")
        : (activeMode === "login" ? "Sign In" : "Create Account");
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

    loginTab.addEventListener("click", () => setMode("login"));
    signupTab.addEventListener("click", () => setMode("signup"));
    document.querySelectorAll("[data-password-target]").forEach((button) => {
      button.addEventListener("click", () => {
        const input = document.getElementById(button.dataset.passwordTarget);
        const showing = input.type === "text";
        input.type = showing ? "password" : "text";
        button.textContent = showing ? "Show" : "Hide";
        button.setAttribute("aria-label", `${showing ? "Show" : "Hide"} password`);
      });
    });

    signupForm.addEventListener("submit", async (event) => {
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

    loginForm.addEventListener("submit", async (event) => {
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
        const desiredWorkspace = detectDemoWorkspace(input.email).toLowerCase();
        if (!Array.isArray(data.user?.roles) || !data.user.roles.includes(desiredWorkspace)) {
          await globalScope.apiFetch(`${globalScope.BASE_URL}/auth/logout`, { method: "POST" });
          throw new Error("This account is not assigned to the expected development workspace.");
        }
        if (data.user.preferredWorkspace !== desiredWorkspace) {
          const workspaceResponse = await globalScope.apiFetch(`${globalScope.BASE_URL}/auth/workspace`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ workspace: desiredWorkspace }),
          });
          const workspaceData = await parseResponse(workspaceResponse);
          if (!workspaceResponse.ok) throw new Error(workspaceData.error || "Workspace could not be selected.");
          data.user = workspaceData.user;
        }
        cacheUser(data.user);
        globalScope.location.replace("dashboard.html#dashboard");
      } catch (error) {
        setFeedback(error.message === "Failed to fetch" ? "Cannot reach the authentication server. Please try again when it is running." : error.message);
      } finally {
        setLoading(loginForm, false);
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
