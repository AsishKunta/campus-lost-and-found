(function () {
  let initialized = false;
  let claimContext = null;

  function value(id, nextValue) {
    const element = document.getElementById(id);
    if (element && nextValue !== undefined) element.value = nextValue ?? "";
    return element?.value?.trim() || "";
  }

  function setSubmitting(submitting, editMode) {
    const button = document.querySelector("#claimForm .submit-btn");
    if (!button) return;
    button.disabled = submitting;
    button.classList.toggle("loading", submitting);
    const label = button.querySelector(".button-text");
    if (label) label.textContent = submitting
      ? "Submitting…"
      : editMode ? "Resubmit Verification →" : "Submit Claim →";
  }

  function configureItemContext(manual) {
    const heading = document.getElementById("claimFormHeading");
    if (heading) heading.textContent = manual ? "New Claim" : "Filing a Claim";
    for (const id of ["claim-itemName", "claim-location", "claim-date", "claim-description"]) {
      const control = document.getElementById(id);
      if (!control) continue;
      control.readOnly = !manual;
      control.required = manual;
      control.setAttribute("aria-readonly", String(!manual));
    }
    const category = document.getElementById("claim-category");
    if (category) {
      category.disabled = !manual;
      category.required = manual;
      category.setAttribute("aria-disabled", String(!manual));
    }
    for (const id of ["claimFoundReportRow", "claimRelatedReportRow"]) {
      const row = document.getElementById(id);
      if (row) row.hidden = manual;
    }
    const dateLabel = document.getElementById("claimDateLabel");
    if (dateLabel) dateLabel.textContent = manual ? "Item Date" : "Date Found";
    const descriptionLabel = document.getElementById("claimDescriptionLabel");
    if (descriptionLabel) descriptionLabel.textContent = manual ? "Item Description" : "Found Item Description";
  }

  function populate(context) {
    claimContext = context || null;
    const manual = context?.manual === true;
    configureItemContext(manual);
    const user = getCurrentUser();
    const stored = (() => { try { return JSON.parse(localStorage.getItem("currentUser")) || {}; } catch (_) { return {}; } })();
    const claim = context?.claim || null;
    const report = manual ? {} : context?.foundReport || (claim ? {
      id: claim.report_id, itemName: claim.found_item_name || claim.item_name,
      itemCategory: claim.found_item_category, location: claim.found_location || claim.location,
      dateFound: claim.found_date, description: claim.found_description || claim.description,
    } : {});
    const foundReportId = context?.foundReportId || report.id || claim?.report_id;
    const lostReportId = context?.lostReportId || report.relatedLostReportId || claim?.lost_report_id;
    value("studentName", stored.name || claim?.student_name || "Authenticated Student");
    value("studentEmail", stored.email || user.email);
    value("studentId", stored.studentId || claim?.authenticated_student_id || "Assigned by account");
    value("claim-itemName", report.itemName || "");
    value("claim-category", report.itemCategory || "");
    value("claim-location", report.location || "");
    value("claim-date", report.dateFound ? String(report.dateFound).slice(0, 10) : "");
    value("claim-foundReportId", foundReportId || "");
    value("claim-relatedReportId", lostReportId || "");
    value("claim-description", report.description || "");
    value("ownershipVerification", claim?.ownership_verification || "");
    value("supportingInformation", claim?.supporting_information || "");
    value("studentComments", claim?.student_comments || "");
    const requestPanel = document.getElementById("verificationRequestPanel");
    if (requestPanel) {
      requestPanel.hidden = !claim?.verification_request;
      requestPanel.textContent = claim?.verification_request
        ? `Administrator request: ${claim.verification_request}` : "";
    }
    setSubmitting(false, Boolean(claim));
  }

  async function submitClaim(event) {
    event.preventDefault();
    const editClaim = claimContext?.claim;
    const ownershipVerification = value("ownershipVerification");
    const supportingInformation = value("supportingInformation");
    const studentComments = value("studentComments");
    if (!ownershipVerification) return showErrorToast("Ownership verification is required.");
    setSubmitting(true, Boolean(editClaim));
    try {
      let response;
      if (editClaim) {
        response = await apiFetch(`${BASE_URL}/claims/${editClaim.id}/verification`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ownershipVerification, supportingInformation, studentComments }),
        });
      } else {
        const manual = claimContext?.manual === true;
        const foundReportId = Number(value("claim-foundReportId"));
        const lostReportId = Number(value("claim-relatedReportId"));
        if (!manual && !foundReportId) {
          throw new Error("Select a Found Item from the Dashboard before filing a claim.");
        }
        const formData = new FormData();
        if (manual) {
          const itemName = value("claim-itemName");
          const itemCategory = value("claim-category");
          const location = value("claim-location");
          const itemDate = value("claim-date");
          const itemDescription = value("claim-description");
          if (!itemName || !itemCategory || !location || !itemDate || !itemDescription) {
            throw new Error("Complete all item details before submitting your claim.");
          }
          formData.append("manual_entry", "true");
          formData.append("item_name", itemName);
          formData.append("item_category", itemCategory);
          formData.append("location", location);
          formData.append("item_date", itemDate);
          formData.append("item_description", itemDescription);
        } else {
          formData.append("report_id", String(foundReportId));
          if (lostReportId) formData.append("lost_report_id", String(lostReportId));
        }
        formData.append("ownership_verification", ownershipVerification);
        formData.append("supporting_information", supportingInformation);
        formData.append("student_comments", studentComments);
        const image = document.getElementById("claimImageInput")?.files?.[0];
        if (image) formData.append("image", image);
        response = await apiFetch(`${BASE_URL}/claims`, { method: "POST", body: formData });
      }
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Claim could not be submitted.");
      showSuccessToast(editClaim
        ? "Verification updated. Your claim is pending administrator review again."
        : "Claim submitted. Status: Pending Admin Review.");
      localStorage.removeItem("lf_reports_cache_v2");
      claimContext = null;
      navigate("my-claims", { forceRefresh: true });
    } catch (error) {
      showErrorToast(error.message || "Claim submission failed.");
    } finally {
      setSubmitting(false, Boolean(editClaim));
    }
  }

  function initClaim(context) {
    populate(context);
    if (initialized) return;
    initialized = true;
    document.getElementById("claimForm")?.addEventListener("submit", submitClaim);
    const wrapper = document.getElementById("fileUploadWrapper");
    const input = document.getElementById("claimImageInput");
    wrapper?.addEventListener("click", () => input?.click());
    input?.addEventListener("change", () => {
      const file = input.files?.[0];
      const label = document.getElementById("claim-fileName");
      if (label) label.textContent = file?.name || "No file selected";
    });
  }

  window.initClaim = initClaim;
})();
