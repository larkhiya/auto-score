**Where the 8 errors sit.** The deterministic half made none: pre-filter 253/253, every NEEDS_REVIEW and PREFILTER_REJECTED record correct, no record lost. All 8 errors are LLM-scored records, and none is at the SHORTLISTED end.

1. **Six medium CVs fell just below the MAYBE line** (51.25–53.75 vs the 55 threshold): csr-013, csr-086, csr-097, csr-102, sdr-037, sdr-107. This is the biggest pattern. The medium personas were calibrated to about 60–65 (L-005), only 5–10 points above the threshold.
2. **Run-to-run noise is larger than that margin.** On byte-identical model input, the name-swap twins differed by up to 17.5 points (sdr pair 1: 71.25 vs 53.75; one criterion went 2 → 1, another 2 → 0). sdr-107 is one of those twins, so at least one of the six misses is noise alone. Temperature 0 does not make `gemini-3.5-flash-lite` deterministic.
3. **Two cross-applicants to csr were scored MAYBE** (csr-056 57.5, csr-092 71.25): prospecting CVs earn csr points for quota numbers, CRM logging, cold calls and objection handling. Same root as the role-switch asymmetry and D-027: the csr anchors are too generic. The fix is a csr v2 (a human decision), not code.

**What this suggests (decide with the consistency numbers from the next quota day):**
- A review band: scores within a few points of a threshold go to NEEDS_REVIEW instead of being decided by one noisy sample. This trades review load for accuracy.
- Or score each CV more than once and take the median (×2–3 the LLM cost).
- Separately: support-specific csr anchors (csr v2), and medium personas calibrated further from the threshold, so the dataset tests the rubric rather than the noise.
- Test design: single-run comparisons (name-swap, the model-level injection check) need tolerances based on the measured noise, or repeated runs.
