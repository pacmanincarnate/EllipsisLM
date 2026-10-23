/**
 * Live KoboldCPP Hardware Smoke Runner
 *
 * Designed to probe a live, running KoboldCPP backend instance on local hardware.
 * Primary model target: TheDrummer_Orion-26B-A4B-v1.1-Q4_K_M.gguf
 *
 * Usage:
 *   node tools/live-kobold-smoke.js [--url http://localhost:5001]
 *   npm run test:kobold:live
 */

const http = require('http');

const PREFERRED_MODEL = 'TheDrummer_Orion-26B-A4B-v1.1-Q4_K_M.gguf';

async function fetchJSON(url, options = {}) {
    return new Promise((resolve, reject) => {
        const parsedUrl = new URL(url);
        const reqOpts = {
            hostname: parsedUrl.hostname,
            port: parsedUrl.port || 80,
            path: parsedUrl.pathname + parsedUrl.search,
            method: options.method || 'GET',
            headers: options.headers || {}
        };

        const req = http.request(reqOpts, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    resolve({ status: res.statusCode, data: parsed, raw: data });
                } catch (e) {
                    resolve({ status: res.statusCode, data: null, raw: data });
                }
            });
        });

        req.on('error', reject);

        if (options.body) {
            req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
        }
        req.end();
    });
}

async function runLiveSmoke() {
    const args = process.argv.slice(2);
    let baseUrl = 'http://127.0.0.1:5001';
    const urlIdx = args.indexOf('--url');
    if (urlIdx !== -1 && args[urlIdx + 1]) {
        baseUrl = args[urlIdx + 1].replace(/\/+$/, '');
    }

    console.log(`======================================================`);
    console.log(`   EllipsisLM Live KoboldCPP Hardware Smoke Probe     `);
    console.log(`======================================================`);
    console.log(`Connecting to: ${baseUrl}`);
    console.log(`Target Model : ${PREFERRED_MODEL}\n`);

    // 1. Probe Model Endpoint
    let modelResult;
    try {
        const res = await fetchJSON(`${baseUrl}/api/v1/model`);
        if (res.status !== 200 || !res.data) {
            console.error(`[FAIL] Endpoint responded with status ${res.status}.`);
            process.exit(1);
        }
        modelResult = res.data.result || 'Unknown';
    } catch (e) {
        console.warn(`[INFO] KoboldCPP is not actively running at ${baseUrl}.`);
        console.warn(`       Please launch KoboldCPP with "${PREFERRED_MODEL}"`);
        console.warn(`       and re-run: npm run test:kobold:live\n`);
        // Exit cleanly with advice rather than crashing CI
        process.exit(0);
    }

    console.log(`[PASS] Server is online.`);
    console.log(`[INFO] Loaded Model: ${modelResult}`);
    if (modelResult.includes('Orion') || modelResult.includes(PREFERRED_MODEL)) {
        console.log(`[PASS] Verified preferred model (${PREFERRED_MODEL}) is loaded!`);
    } else {
        console.log(`[NOTE] Currently loaded model differs from default target (${PREFERRED_MODEL}).`);
    }

    // 2. Latency & Generation Benchmark
    console.log(`\n[PROBE] Measuring generation latency and throughput...`);
    const prompt = `<s>[INST] Write a single poetic sentence describing a solitary lantern in the rain. [/INST]`;
    const payload = {
        prompt,
        max_context_length: 4096,
        max_length: 64,
        temperature: 0.7,
        top_p: 0.9,
        min_p: 0.1,
        stop_sequence: ["</s>", "[INST]"]
    };

    const startTime = Date.now();
    try {
        const genRes = await fetchJSON(`${baseUrl}/api/v1/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: payload
        });

        const durationMs = Date.now() - startTime;
        if (genRes.status !== 200 || !genRes.data || !genRes.data.results) {
            console.error(`[FAIL] Generation failed with status ${genRes.status}`);
            console.error(genRes.raw);
            process.exit(1);
        }

        const output = genRes.data.results[0]?.text || '';
        const approxTokens = output.trim().split(/\s+/).length * 1.3;
        const tokSec = ((approxTokens / (durationMs / 1000))).toFixed(1);

        console.log(`[PASS] Generation successful in ${durationMs}ms (~${tokSec} tokens/sec).`);
        console.log(`[OUTPUT]:\n"${output.trim()}"`);
    } catch (e) {
        console.error(`[FAIL] Error during generation probe:`, e.message);
        process.exit(1);
    }

    // 3. Stop Sequence Adherence Probe
    console.log(`\n[PROBE] Verifying character name stop sequence adherence...`);
    const dialoguePrompt = `Alice: Where are we going?\nBob: To the mountains.\nAlice: Is it safe?\nBob:`;
    try {
        const stopRes = await fetchJSON(`${baseUrl}/api/v1/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: {
                prompt: dialoguePrompt,
                max_length: 48,
                stop_sequence: ["\nAlice:", "\nAlice: "]
            }
        });

        const stopOutput = stopRes.data?.results?.[0]?.text || '';
        if (stopOutput.includes('Alice:')) {
            console.error(`[FAIL] Model output leaked past stop sequence: "${stopOutput}"`);
            process.exit(1);
        } else {
            console.log(`[PASS] Model halted cleanly before Alice stop sequence.`);
            console.log(`[OUTPUT]: "${stopOutput.trim()}"`);
        }
    } catch (e) {
        console.error(`[FAIL] Error during stop sequence probe:`, e.message);
        process.exit(1);
    }

    console.log(`\n======================================================`);
    console.log(`[SUCCESS] Live KoboldCPP Hardware Verification Complete!`);
    console.log(`======================================================\n`);
}

runLiveSmoke().catch(err => {
    console.error('Fatal probe error:', err);
    process.exit(1);
});
