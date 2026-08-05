const DEFAULT_CLAIM_EXPIRY_DAYS = 60;

function getWorkflowConfig(environment = process.env) {
  const parsed = Number.parseInt(environment.CLAIM_EXPIRY_DAYS, 10);
  return {
    claimExpiryDays:
      Number.isSafeInteger(parsed) && parsed > 0 ? parsed : DEFAULT_CLAIM_EXPIRY_DAYS,
  };
}

module.exports = { DEFAULT_CLAIM_EXPIRY_DAYS, getWorkflowConfig };
