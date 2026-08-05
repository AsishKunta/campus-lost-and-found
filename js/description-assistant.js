(function descriptionAssistantModule(globalScope) {
  "use strict";

  function createSuggestionState(original, suggestion) {
    let draft = String(suggestion || "");
    return {
      original: String(original || ""),
      suggestion: () => draft,
      updateSuggestion(value) { draft = String(value || ""); },
      useSuggestion() { return draft; },
      keepOriginal() { return String(original || ""); },
    };
  }

  let initialized = false;
  let requestInFlight = false;
  let currentState = null;

  function resetDescriptionAssistant() {
    requestInFlight = false;
    currentState = null;
    const panel = document.getElementById("aiDescriptionPanel");
    const feedback = document.getElementById("aiDescriptionFeedback");
    const button = document.getElementById("improveDescriptionBtn");
    if (panel) panel.hidden = true;
    if (feedback) {
      feedback.hidden = true;
      feedback.textContent = "";
    }
    if (button) {
      button.disabled = false;
      button.textContent = "✨ Improve with AI";
    }
  }

  function initDescriptionAssistant() {
    if (initialized) return;
    const description = document.getElementById("description");
    const button = document.getElementById("improveDescriptionBtn");
    const panel = document.getElementById("aiDescriptionPanel");
    const originalPreview = document.getElementById("aiOriginalDescription");
    const suggestion = document.getElementById("aiSuggestedDescription");
    const feedback = document.getElementById("aiDescriptionFeedback");
    const useButton = document.getElementById("useAiSuggestionBtn");
    const editButton = document.getElementById("editAiSuggestionBtn");
    const keepButton = document.getElementById("keepOriginalDescriptionBtn");
    if (!description || !button || !panel || !suggestion) return;
    initialized = true;

    function showFeedback(message, error = false) {
      feedback.textContent = message;
      feedback.classList.toggle("is-error", error);
      feedback.hidden = false;
    }

    button.addEventListener("click", async () => {
      if (requestInFlight) return;
      const original = description.value.trim();
      if (!original) {
        showFeedback("Enter a description before requesting a suggestion.", true);
        description.focus();
        return;
      }
      requestInFlight = true;
      button.disabled = true;
      button.textContent = "Improving description…";
      feedback.hidden = true;
      try {
        const response = await globalScope.apiFetch(
          `${globalScope.BASE_URL}/description-assistant/improve`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ description: original }),
          }
        );
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || "Description improvement is unavailable.");
        currentState = createSuggestionState(original, body.suggestion);
        originalPreview.textContent = original;
        suggestion.value = body.suggestion;
        suggestion.readOnly = true;
        editButton.textContent = "Edit Suggestion";
        panel.hidden = false;
        showFeedback("AI suggestion ready. Review it before choosing whether to use it.");
      } catch (_) {
        showFeedback("We couldn't improve the description right now. Your original text is still safe.", true);
      } finally {
        requestInFlight = false;
        button.disabled = false;
        button.textContent = "✨ Improve with AI";
      }
    });

    useButton.addEventListener("click", () => {
      if (!currentState) return;
      currentState.updateSuggestion(suggestion.value);
      description.value = currentState.useSuggestion();
      panel.hidden = true;
      showFeedback("Suggestion applied. You can still edit it before submitting.");
      description.focus();
    });

    editButton.addEventListener("click", () => {
      if (!currentState) return;
      suggestion.readOnly = false;
      editButton.textContent = "Editing Suggestion";
      suggestion.focus();
    });

    keepButton.addEventListener("click", () => {
      if (!currentState) return;
      description.value = currentState.keepOriginal();
      panel.hidden = true;
      showFeedback("Original description kept.");
      description.focus();
    });
  }

  const exported = { createSuggestionState };
  if (typeof module !== "undefined" && module.exports) module.exports = exported;
  globalScope.initDescriptionAssistant = initDescriptionAssistant;
  globalScope.resetDescriptionAssistant = resetDescriptionAssistant;
})(typeof window !== "undefined" ? window : globalThis);
