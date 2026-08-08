function createPasswordResetDelivery(config, dependencies = {}) {
  const request = dependencies.fetch || globalThis.fetch;

  return async function deliverPasswordReset({ email, token }) {
    if (config.emailProvider !== "resend") return false;
    if (!config.resendApiKey || !config.fromEmail || !config.frontendUrl || !request) {
      throw new Error("Password reset email delivery is not configured.");
    }

    const resetUrl = `${config.frontendUrl}/reset-password.html?token=${encodeURIComponent(token)}`;
    const response = await request("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: config.fromEmail,
        to: [email],
        subject: "Reset your Campus Lost & Found password",
        html: `<p>A password reset was requested for your Campus Lost &amp; Found account.</p><p><a href="${resetUrl}">Reset password</a></p><p>This link expires shortly and can be used once. If you did not request it, ignore this email.</p>`,
      }),
    });
    if (!response.ok) throw new Error("Password reset email delivery failed.");
    return true;
  };
}

module.exports = { createPasswordResetDelivery };
