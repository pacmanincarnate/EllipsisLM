/**
 * E2E test for the two-phase AI request timeout.
 *
 * A single 60-second inactivity budget used to govern every provider, which is
 * too short for local models still loading and processing a prompt (no bytes
 * yet) and for non-streaming providers that must finish inside the window.
 * The budget is now:
 *
 *   phase 1 — waiting for the first token  (default 300s, user-configurable)
 *   phase 2 — a gap between streamed tokens (60s)
 *
 * This suite drives the real APIService.callAI against a mock server that:
 *   1. answers normally,
 *   2. accepts the request then stalls before any content (phase 1),
 *   3. emits one token then stalls (phase 2).
 *
 * It also checks that the setting is present in the Model tab, defaults to 300
 * seconds, and persists into global settings.
 */

const http = require('http');
const path = require('path');
const { chromium } = require('playwright');

const REPO_ROOT = path.resolve(__dirname, '..');

let mode = 'normal';

function startMockServer() {
    const server = http.createServer((req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Headers', '*');
        res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');

        if (req.method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return;
        }

        if (!req.url.startsWith('/v1/chat/completions')) {
            res.writeHead(404);
            res.end();
            return;
        }

        req.on('data', () => { });
        req.on('end', () => {
            res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive'
            });
            // Headers plus an SSE comment: the connection is alive, but no content yet.
            res.write(': prefill\n\n');

            if (mode === 'stall-after-token') {
                res.write('data: ' + JSON.stringify({ choices: [{ delta: { content: 'Hello' } }] }) + '\n\n');
            } else if (mode === 'normal') {
                res.write('data: ' + JSON.stringify({ choices: [{ delta: { content: 'Hello there.' } }] }) + '\n\n');
                res.write('data: ' + JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] }) + '\n\n');
                res.write('data: [DONE]\n\n');
                res.end();
            }
            // Anything else leaves the response open forever (stall).
        });
    });

    return new Promise(resolve => {
        server.listen(0, '127.0.0.1', () => {
            resolve({ server, url: `http://127.0.0.1:${server.address().port}` });
        });
    });
}

(async () => {
    let browser = null;
    let server = null;
    let passed = 0;
    let failed = 0;

    const check = (name, condition, detail) => {
        if (condition) {
            console.log(`  ✓ PASS: ${name}`);
            passed++;
        } else {
            console.error(`  ✗ FAIL: ${name}${detail ? ` — ${detail}` : ''}`);
            failed++;
        }
    };

    try {
        const mock = await startMockServer();
        server = mock.server;
        const mockUrl = mock.url;
        console.log(`[AI Timeout E2E] Mock server listening on ${mockUrl}`);

        browser = await chromium.launch({ headless: true });
        const page = await browser.newPage();
        await page.addInitScript(() => localStorage.setItem('onboarding_dismissed', 'true'));
        await page.goto('file://' + path.join(REPO_ROOT, 'index.html'));
        await page.waitForTimeout(4000);
        await page.reload();
        await page.waitForTimeout(3000);

        const runCall = (options) => page.evaluate(async ({ url, options }) => {
            ReactiveStore.state.apiProvider = 'koboldcpp';
            ReactiveStore.state.koboldcpp_url = url;
            const started = Date.now();
            try {
                const text = await APIService.callAI('hello', false, null, true, options);
                return { ok: true, text, elapsed: Date.now() - started };
            } catch (e) {
                return { ok: false, message: e.message, elapsed: Date.now() - started };
            }
        }, { url: mockUrl, options });

        mode = 'normal';
        const normal = await runCall({ timeoutMs: 5000, interTokenMs: 2000 });

        mode = 'stall-before-content';
        const stallBeforeContent = await runCall({ timeoutMs: 400, interTokenMs: 5000 });

        mode = 'stall-after-token';
        const stallAfterToken = await runCall({ timeoutMs: 5000, interTokenMs: 400 });

        const ui = await page.evaluate(() => {
            AppController.openModal('settings-modal');
            AppController.switchSettingsTab('model');
            const input = document.getElementById('request-first-byte-timeout-input');
            const initialValue = input ? input.value : null;
            if (input) {
                input.value = '600';
                input.dispatchEvent(new Event('input', { bubbles: true }));
            }
            return {
                exists: !!input,
                initialValue,
                stored: StateManager.data.globalSettings.requestFirstByteTimeoutSeconds,
                inModelKeys: AppController.CONSTANTS.MODEL_SETTING_KEYS.includes('requestFirstByteTimeoutSeconds')
            };
        });

        console.log('[AI Timeout E2E] Results:', JSON.stringify({ normal, stallBeforeContent, stallAfterToken, ui }, null, 2));

        check(
            'a normal request still returns its text',
            normal.ok === true && /Hello there\./.test(normal.text || ''),
            JSON.stringify(normal)
        );
        check(
            'phase 1 reports a first-token timeout',
            stallBeforeContent.ok === false && /timed out/.test(stallBeforeContent.message || '') && /did not start responding/.test(stallBeforeContent.message || ''),
            stallBeforeContent.message
        );
        check(
            'phase 1 fires near the first-token budget',
            stallBeforeContent.elapsed < 3000,
            `elapsed ${stallBeforeContent.elapsed}ms`
        );
        check(
            'phase 2 reports a mid-response timeout',
            stallAfterToken.ok === false && /timed out/.test(stallAfterToken.message || '') && /stopped sending data/.test(stallAfterToken.message || ''),
            stallAfterToken.message
        );
        check(
            'phase 2 fires near the between-token budget',
            stallAfterToken.elapsed < 3000,
            `elapsed ${stallAfterToken.elapsed}ms`
        );
        check(
            'the Model tab exposes the timeout setting with the 300s default',
            ui.exists === true && ui.initialValue === '300',
            JSON.stringify(ui)
        );
        check(
            'editing the setting persists into global settings',
            ui.stored === '600',
            String(ui.stored)
        );
        check(
            'the setting is registered as a global model key',
            ui.inModelKeys === true
        );
    } catch (err) {
        console.error('[AI Timeout E2E] Crashed:', err);
        failed++;
    } finally {
        if (browser) await browser.close().catch(() => { });
        if (server) server.close();
    }

    console.log(`\n[AI Timeout E2E Summary] Passed: ${passed} | Failed: ${failed}`);
    process.exit(failed ? 1 : 0);
})();
