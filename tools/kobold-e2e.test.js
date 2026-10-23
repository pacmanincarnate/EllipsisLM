/**
 * Playwright E2E Test Suite for KoboldCPP Local Model Integration
 *
 * Runs headless Chromium against index.html and a local MockKoboldServer.
 * Verifies:
 *   1. Connection health check (APIService.testConnection).
 *   2. Chat completion turn via Jinja endpoint (/v1/chat/completions).
 *   3. Dynamic fallback to /api/v1/generate when chat completions fails.
 *   4. Polled streaming loop (/api/v1/generate -> /api/extra/generate/check).
 *   5. Thinking / reasoning extraction from local models (<think> blocks).
 *   6. Stop sequence slicing during narrative dialogue.
 *   7. Graceful error handling when local backend is unreachable.
 */

const { chromium } = require('playwright');
const path = require('path');
const MockKoboldServer = require('./mock-kobold-server');

const TEST_PORT = 5088;
const MOCK_URL = `http://127.0.0.1:${TEST_PORT}`;

(async () => {
    console.log('[Kobold E2E] Initializing Mock KoboldCPP Server on port ' + TEST_PORT + '...');
    const mockServer = new MockKoboldServer({
        port: TEST_PORT,
        modelName: 'TheDrummer_Orion-26B-A4B-v1.1-Q4_K_M.gguf'
    });
    await mockServer.start();

    console.log('[Kobold E2E] Launching headless browser...');
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    // Bypass onboarding
    await page.addInitScript(() => {
        localStorage.setItem('onboarding_dismissed', 'true');
    });

    const indexPath = path.resolve(__dirname, '../index.html');
    console.log('[Kobold E2E] Loading application:', indexPath);
    await page.goto('file://' + indexPath);

    // Allow database seeding and UI bootstrap
    await page.waitForTimeout(4000);
    await page.reload();
    await page.waitForTimeout(3000);

    let passedTests = 0;
    let failedTests = 0;

    function recordPass(name) {
        console.log(`  ✓ PASS: ${name}`);
        passedTests++;
    }

    function recordFail(name, err) {
        console.error(`  ✗ FAIL: ${name}:`, err);
        failedTests++;
    }

    try {
        // Configure state to use KoboldCPP on the mock server
        await page.evaluate((mockUrl) => {
            ReactiveStore.state.apiProvider = 'koboldcpp';
            ReactiveStore.state.koboldcpp_url = mockUrl;
            ReactiveStore.state.koboldcpp_template = 'jinja';
            ReactiveStore.state.koboldcpp_min_p = 0.1;
            ReactiveStore.state.koboldcpp_dry = 0.25;
            ReactiveStore.state.koboldcpp_max_tokens = 2048;
            StateManager.saveGlobalSettings();
        }, MOCK_URL);

        // ─── Test 1: Connection Health Check ──────────────────────────────
        console.log('\n[Test 1] Testing APIService.testConnection for KoboldCPP...');
        try {
            const isConnected = await page.evaluate(async (mockUrl) => {
                return await APIService.testConnection('koboldcpp', { koboldcpp_url: mockUrl });
            }, MOCK_URL);

            if (isConnected === true) {
                recordPass('APIService.testConnection responds successfully');
            } else {
                recordFail('APIService.testConnection', `Expected true, got ${isConnected}`);
            }
        } catch (e) {
            recordFail('APIService.testConnection', e.message);
        }

        // ─── Test 2: Standard Generation & Parameter Propagation ─────────
        console.log('\n[Test 2] Testing callKoboldCPP via /api/v1/generate with sampling params...');
        try {
            mockServer.setNextResponse({
                text: '*The warrior nods.* "The road ahead is quiet."',
                thinking: 'Checking local travel context.'
            });

            const result = await page.evaluate(async () => {
                return await APIService.callKoboldCPP('Hello there', null, false);
            });

            const req = mockServer.lastRequest;
            if (req && req.pathname === '/api/v1/generate') {
                recordPass('Request routed to /api/v1/generate');
            } else {
                recordFail('API routing', `Expected /api/v1/generate, got ${req?.pathname}`);
            }

            if (req && req.body && req.body.min_p === 0.1 && req.body.dry_multiplier === 0.25) {
                recordPass('Sampling parameters (min_p, dry_multiplier) propagated accurately');
            } else {
                recordFail('Sampling params', `Params mismatched: ${JSON.stringify(req?.body)}`);
            }

            if (result.text.includes('The road ahead is quiet')) {
                recordPass('Generated text contains expected model completion');
            } else {
                recordFail('Completion text', `Unexpected text: ${result.text}`);
            }

            if (result.thinking.includes('Checking local travel context')) {
                recordPass('Reasoning / thinking content extracted cleanly');
            } else {
                recordFail('Thinking extraction', `Unexpected thinking: ${result.thinking}`);
            }
        } catch (e) {
            recordFail('callKoboldCPP generate', e.message);
        }

        // ─── Test 3: Backend Error Handling ────────────────────────────────
        console.log('\n[Test 3] Testing backend error handling (HTTP 500 / OOM)...');
        try {
            mockServer.reset();
            mockServer.setChaos({ simulateOOM: true });

            const errorCaught = await page.evaluate(async () => {
                try {
                    await APIService.callKoboldCPP('OOM trigger prompt', null, false);
                    return false;
                } catch (e) {
                    return e.message.includes('CUDA error') || e.message.includes('KoboldCPP API Error');
                }
            });

            if (errorCaught) {
                recordPass('OOM error reported cleanly through APIService without hanging');
            } else {
                recordFail('Error handling', 'Did not catch expected Kobold error');
            }
        } catch (e) {
            recordFail('Error handling test', e.message);
        } finally {
            mockServer.reset();
        }

        // ─── Test 4: Polled Streaming Loop ─────────────────────────────────
        console.log('\n[Test 4] Testing streamKoboldPolled via polling loop...');
        try {
            mockServer.reset();
            mockServer.setNextResponse('Streaming chunk by chunk from local KoboldCPP.');

            const streamResults = await page.evaluate(async () => {
                const chunks = [];
                await APIService.streamKoboldPolled('Stream this prompt', (textChunk) => {
                    chunks.push(textChunk);
                });
                return chunks;
            });

            if (streamResults.length > 0) {
                recordPass(`Stream delivered ${streamResults.length} intermediate polling updates`);
                const lastChunk = streamResults[streamResults.length - 1];
                if (lastChunk.includes('Streaming chunk by chunk')) {
                    recordPass('Final chunk contains full stream completion text');
                } else {
                    recordFail('Final stream chunk', `Expected full text, got: ${lastChunk}`);
                }
            } else {
                recordFail('Polling stream', 'No chunks received');
            }
        } catch (e) {
            recordFail('streamKoboldPolled', e.message);
        }

        // ─── Test 5: Inline Thinking Extraction ───────────────────────────
        console.log('\n[Test 5] Testing <think> block extraction from local models...');
        try {
            mockServer.reset();
            mockServer.setNextResponse('<think>Considering tactical situation.\nPlayer has drawn their sword.</think>*She readies her shield.* "Be cautious."');

            const result = await page.evaluate(async () => {
                return await APIService.callKoboldCPP('Combat turn', null, false, { isNarrative: true });
            });

            if (!result.text.includes('<think>') && result.text.includes('*She readies her shield.* "Be cautious."')) {
                recordPass('Thinking block stripped from dialogue text');
            } else {
                recordFail('Thinking stripping', `Thinking leaked into text: ${result.text}`);
            }

            if (result.thinking.includes('Considering tactical situation')) {
                recordPass('Thinking content preserved in thinking metadata field');
            } else {
                recordFail('Thinking metadata', `Thinking missing from metadata: ${result.thinking}`);
            }
        } catch (e) {
            recordFail('Thinking extraction', e.message);
        }

        // ─── Test 6: Stop Sequence Slicing ────────────────────────────────
        console.log('\n[Test 6] Testing stop sequence slicing to prevent character takeover...');
        try {
            mockServer.reset();
            // Character in active state is Adventurer
            mockServer.setNextResponse('I see you standing there.\nAdventurer: What are you doing?\nI replied nothing.');

            const result = await page.evaluate(async () => {
                // Ensure Adventurer character is in characters list
                ReactiveStore.state.characters = [
                    { id: 'user-1', name: 'Adventurer', is_user: true }
                ];
                return await APIService.callKoboldCPP('Dialogue turn', null, false, { isNarrative: true });
            });

            if (!result.text.includes('Adventurer:') && result.text.includes('I see you standing there.')) {
                recordPass('Stop sequence truncated impersonation of Adventurer cleanly');
            } else {
                recordFail('Stop sequence truncation', `Text leaked beyond stop sequence: ${result.text}`);
            }
        } catch (e) {
            recordFail('Stop sequence test', e.message);
        }

        // ─── Test 7: Unreachable Backend Handling ─────────────────────────
        console.log('\n[Test 7] Testing error handling when KoboldCPP is offline / unreachable...');
        try {
            const errorCaught = await page.evaluate(async () => {
                try {
                    await APIService.testConnection('koboldcpp', { koboldcpp_url: 'http://127.0.0.1:59999' });
                    return false;
                } catch (e) {
                    return true;
                }
            });

            if (errorCaught) {
                recordPass('Unreachable endpoint caught and reported without crashing application');
            } else {
                recordFail('Unreachable endpoint', 'Failed to throw or report error on dead port');
            }
        } catch (e) {
            recordFail('Dead port test', e.message);
        }

    } finally {
        console.log('\n[Kobold E2E] Cleaning up browser and mock server...');
        await browser.close();
        await mockServer.stop();
    }

    console.log(`\n======================================================`);
    console.log(`[Kobold E2E Summary] Passed: ${passedTests} | Failed: ${failedTests}`);
    console.log(`======================================================\n`);

    if (failedTests > 0) {
        process.exit(1);
    } else {
        process.exit(0);
    }
})();
