// Pipeline settings that are code-level choices, not per-job data (C-06). Bundled into WF-10.
// Changing one is a versioned decision: rebuild + re-import, and every result records it.
module.exports = {
  // D-026. Every CrmUpdate records this as prompt_version.
  SCREENING_PROMPT_VERSION: 'screening_v2',
};
