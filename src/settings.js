// Pipeline settings that are code-level choices, not per-job data (C-06). Bundled into WF-10 and WF-12.
// Changing one is a versioned decision: rebuild + re-import, and every result records it.
module.exports = {
  // D-026. Every CrmUpdate records this as prompt_version.
  SCREENING_PROMPT_VERSION: 'screening_v2',
  // D-031. WF-12 calls Gemini through the local llm-proxy (passthrough unless a fault is armed).
  // A deployment without the proxy sets 'https://generativelanguage.googleapis.com'.
  LLM_BASE_URL: 'http://llm-proxy:8090',
};
