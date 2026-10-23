---
name: ellipsis-local-test-suite
description: >-
  Execute the multi-tier local test regime for EllipsisLM (pure unit tests, technical section map,
  Electron IPC lifecycle contracts, Playwright headless KoboldCPP E2E, and live hardware smoke probes)
  and produce an extensive diagnostic report. Use whenever the user asks to run tests, verify local
  model functionality, test KoboldCPP integration, or create a comprehensive test report.
---

# EllipsisLM Local Test Suite & Reporting Skill

This skill guides the agent in running the multi-tiered local test regime for EllipsisLM, interpreting results across all layers, and generating an extensive diagnostic and regression report.

## When to Use
- When verifying code modifications against the local installation and KoboldCPP backend.
- When the user asks to "run the test suite", "test Kobold integration", "run extensive tests", or "create a test report".
- Prior to creating releases or after making architectural changes in `index.html` or `electron/`.

---

## Test Execution Runbook

### 1. Automated Test Execution

Run the extensive test suite using PowerShell via `run_command`:

```powershell
npm run test:extensive
```

> [!NOTE]
> `npm run test:extensive` sequentially executes:
> 1. `test.js` (Pure JS unit tests: templating, thinking extraction, stop sequences, compatibility).
> 2. `tools/check-map.test.js` (Monolithic section map and binding integrity).
> 3. `tools/electron-kobold.test.js` (CLI arguments, CUDA/Metal flags, log regexes, IPC symmetry).
> 4. `tools/kobold-e2e.test.js` (Playwright headless Chromium testing 7 full roleplay & generation scenarios).

### 2. Selective Test Commands

If debugging or focusing on a specific tier:
- **Fast Unit Tests & Map**: `npm test`
- **Electron Lifecycle & IPC**: `npm run test:kobold:ipc`
- **Playwright Kobold E2E**: `npm run test:kobold`
- **Live Hardware Smoke Probe**: `npm run test:kobold:live` (checks `http://localhost:5001` for `TheDrummer_Orion-26B-A4B-v1.1-Q4_K_M.gguf`)

---

## Extensive Reporting Protocol

After test execution, create a comprehensive report artifact named `test_report_<timestamp>.md` or present structured markdown in chat adhering to the following format:

### Report Format

1. **Executive Summary**:
   - Date & local timestamp.
   - Overall pass/fail status and suite duration.
   - Commit hash or working tree status.
2. **Suite Breakdown Matrix**:
   | Test Tier | Runner / Tool | Total Tests | Passed | Failed | Duration | Status |
   | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
   | Tier 1: Pure Unit Helpers | `node test.js` | # | # | # | # ms | PASS/FAIL |
   | Tier 2: Technical Section Map | `node tools/check-map.test.js` | # | # | # | # ms | PASS/FAIL |
   | Tier 3: Electron Process & IPC | `node tools/electron-kobold.test.js` | # | # | # | # ms | PASS/FAIL |
   | Tier 4: Headless Kobold E2E | `node tools/kobold-e2e.test.js` | 12 | # | # | # s | PASS/FAIL |
   | Tier 5: Live Hardware Probe | `node tools/live-kobold-smoke.js` | Opt | # | # | # ms | ONLINE/OFFLINE |
3. **Detailed Findings by Component**:
   - **Sampling & Generation**: Verification of `min_p`, `dry`, and context length propagation.
   - **Thinking & Reasoning Separation**: Quarantining of `<think>` blocks from dialogue bubbles.
   - **Stop Sequence Enforcement**: Halting of character name impersonation.
   - **Error & Disconnection Resilience**: Recovery from backend 500 / OOM / offline port.
4. **Failure Diagnostics (if any)**:
   - Failing test name and exact stack trace / assertion failure.
   - Root cause analysis and remediation recommendation.
5. **Hardware Probe Summary (if live runner was executed)**:
   - Detected model name (`TheDrummer_Orion-26B-A4B-v1.1-Q4_K_M.gguf` or other).
   - Measured TTFT (Time to First Token) and generation speed (tokens/sec).
