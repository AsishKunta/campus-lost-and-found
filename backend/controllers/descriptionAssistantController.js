const { getDescriptionAssistantConfig } = require("../config/descriptionAssistant");
const {
  DescriptionAssistantError,
  createDescriptionAssistant,
} = require("../services/descriptionAssistantService");
const { logError } = require("../utils/safeLogger");

function createDescriptionAssistantController(options = {}) {
  const assistant = options.assistant || createDescriptionAssistant({
    config: options.config || getDescriptionAssistantConfig(),
  });

  return async function improveDescription(req, res) {
    try {
      const suggestion = await assistant.improveDescription(req.body?.description);
      return res.status(200).json({ suggestion });
    } catch (error) {
      if (error instanceof DescriptionAssistantError) {
        return res.status(error.status).json({ error: error.message, code: error.code });
      }
      logError("description_assistant.request_failed", error);
      return res.status(503).json({
        error: "We couldn't improve the description right now. Your original text is still safe.",
        code: "AI_DESCRIPTION_UNAVAILABLE",
      });
    }
  };
}

module.exports = {
  createDescriptionAssistantController,
  improveDescription: createDescriptionAssistantController(),
};
