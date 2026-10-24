// Pipeline settings that are code-level choices, not per-job data (C-06). Bundled into WF-10 and WF-12.
// Changing one is a versioned decision: rebuild + re-import, and every result records it.
module.exports = {
  // D-026. Every CrmUpdate records this as prompt_version.
  SCREENING_PROMPT_VERSION: 'screening_v2',
  // D-035. A score within this many points of the MAYBE or SHORTLISTED threshold (inclusive) goes to
  // NEEDS_REVIEW (NEAR_THRESHOLD): the model's run-to-run noise (mean 4.5, max 11.25 on identical input)
  // must not decide a borderline case. A property of the model, not of the role, so it lives here.
  REVIEW_BAND_POINTS: 2.5,
  // D-031. WF-12 calls Gemini through the local llm-proxy (passthrough unless a fault is armed).
  // A deployment without the proxy sets 'https://generativelanguage.googleapis.com'.
  LLM_BASE_URL: 'http://llm-proxy:8090',
};
