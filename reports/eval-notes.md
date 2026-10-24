**Where the 8 errors sit.** The deterministic half made none: pre-filter 253/253, every NEEDS_REVIEW and PREFILTER_REJECTED record correct, no record lost. All 8 errors are LLM-scored records, and none is at the SHORTLISTED end.

1. **Six medium CVs fell just below the MAYBE line** (51.25–53.75 vs the 55 threshold): csr-013, csr-086, csr-097, csr-102, sdr-037, sdr-107. This is the biggest pattern. The medium personas were calibrated to about 60–65 (L-005), only 5–10 points above the threshold.
2. **Run-to-run noise is larger than that margin.** On byte-identical model input, the name-swap twins differed by up to 17.5 points (sdr pair 1: 71.25 vs 53.75; one criterion went 2 → 1, another 2 → 0). sdr-107 is one of those twins, so at least one of the six misses is noise alone. Temperature 0 does not make `gemini-3.5-flash-lite` deterministic.
3. **Two cross-applicants to csr were scored MAYBE** (csr-056 57.5, csr-092 71.25): prospecting CVs earn csr points for quota numbers, CRM logging, cold calls and objection handling. Same root as the role-switch asymmetry and D-027: the csr anchors are too generic. The fix is a csr v2 (a human decision), not code.

**What the consistency runs measured (quota day 2, 2026-10-24, `~e2` and `~e3`: 80 calls, 0 repairs).** The same 20 CVs, three times, identical model input each time:
- **Spread per CV:** mean 4.5 points, median 5, p90 8.75, max 11.25 (sdr-015: 78.75 / 90 / 86.25). 5 of 20 CVs scored identically all three times; all were either very strong or very thin.
- **Status flips:** 1 CV of 20, csr-013 (51.25 / 56.25 / 58.75): a medium CV whose true score sits on the 55 line.
- **Accuracy:** single runs agree with the answer key on 19, 20 and 20 of 20; the median of the three runs on 20/20.
- **Spread vs the name-swap twins:** the twins' 17.5-point gap is larger than any spread in this sample, so the noise has a longer tail than 20 CVs × 3 runs can show. These are bounds from a small sample, not a distribution.

**What a review band would have done on the full `~e1` run (185 LLM-scored records; no new calls):**

| Band around 55 and 75 | Records sent to review | `~e1` errors caught | Correct records also sent to review |
|---|---|---|---|
| ±2.5 | 9 (4.9%) | 6 of 8 | 3 |
| ±3.75 | 28 (15.1%) | 8 of 8 | 20 |
| ±5 | 32 (17.3%) | 8 of 8 | 24 |

The two errors ±2.5 misses are csr-013 at 51.25 and csr-092 at 71.25. csr-092 is a cross-applicant: a rubric problem that a band only catches by luck.

**What this suggests:**
- A review band: scores within a few points of a threshold go to NEEDS_REVIEW instead of being decided by one noisy sample. This trades review load for accuracy.
- Or score each CV more than once and take the median (×2–3 the LLM cost).
- Separately: support-specific csr anchors (csr v2), and medium personas calibrated further from the threshold, so the dataset tests the rubric rather than the noise.
- Test design: single-run comparisons (name-swap, the model-level injection check) need tolerances based on the measured noise, or repeated runs.
