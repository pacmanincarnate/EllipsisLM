const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');

(async () => {
    const browser = await chromium.launch({ headless: true, ...(process.env.PLAYER_TEST_BROWSER ? { executablePath: process.env.PLAYER_TEST_BROWSER } : {}) });
    try {
        const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.route('https://**/*', route => {
            const url = route.request().url();
            let file;
            if (url.includes('/marked/')) file = path.join(path.dirname(require.resolve('marked')), 'marked.umd.js');
            if (url.includes('/jszip/')) file = path.resolve(path.dirname(require.resolve('jszip')), '../dist/jszip.min.js');
            if (url.includes('/pako/')) file = path.join(path.dirname(require.resolve('pako')), 'dist/pako.min.js');
            return file ? route.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(file) }) : route.abort();
        });
        await page.addInitScript(() => localStorage.setItem('onboarding_dismissed', 'true'));
        await page.goto(pathToFileURL(path.resolve(__dirname, '../index.html')).href);
        await page.waitForFunction(() => typeof ReactiveStore !== 'undefined' && !!ReactiveStore.state);
        await page.evaluate(() => {
            window.sentDrafts = [];
            window.suggestionCalls = [];
            NarrativeController.sendMessage = async () => window.sentDrafts.push(document.getElementById('chat-input').value);
            APIService.callAI = async prompt => { window.suggestionCalls.push(prompt); return '[]'; };
            const container = document.getElementById('response-options-container');
            container.innerHTML = UIComponents.ResponseOptions([{ label: 'Ask gently', prompt: 'I ask, "What happened?"\nI keep my hands visible.' }]);
            container.classList.remove('hidden');
        });
        await page.locator('#response-options-container button').click();
        assert.deepEqual(await page.evaluate(() => window.sentDrafts), []);
        assert.deepEqual(await page.evaluate(() => window.suggestionCalls), []);
        assert.equal(await page.inputValue('#chat-input'), 'I ask, "What happened?"\nI keep my hands visible.');
        assert.equal(await page.locator('#chat-input').evaluate(el => document.activeElement === el), true);

        const personality = 'Patient and compassionate, with dry humor. Distrusts authority and avoids needless violence.';
        const changed = 'Impulsive and curious. Speaks softly, asks direct questions, and protects frightened strangers.';
        const fixture = await page.evaluate(async () => {
            const story = await StoryService.createNewStory();
            StateManager.getLibrary().stories.push(story);
            await LibraryController.editScenario(story.id, story.scenarios[0].id);
            return { storyId: story.id, scenarioId: story.scenarios[0].id };
        });
        await page.click('#scenario-tab-btn-player');
        await page.fill('#scenario-player-personality', personality);
        await page.click('#scenario-tab-btn-cast');
        await page.click('#scenario-tab-btn-player');
        assert.equal(await page.inputValue('#scenario-player-personality'), personality);
        await page.evaluate(() => LibraryController.saveScenario());
        const runs = await page.evaluate(async fixture => {
            const first = await StoryService.createNarrativeFromScenario(fixture.storyId, fixture.scenarioId);
            const second = await StoryService.createNarrativeFromScenario(fixture.storyId, fixture.scenarioId);
            StateManager.getLibrary().active_story_id = fixture.storyId;
            StateManager.getLibrary().active_narrative_id = first.id;
            StateManager.saveLibrary();
            return { first: first.id, second: second.id };
        }, fixture);
        await page.reload();
        await page.waitForFunction(() => typeof ReactiveStore !== 'undefined' && !!ReactiveStore.state?.narrativeId);
        await page.evaluate(() => {
            Object.assign(ReactiveStore.state, { enableAutoStaticKnowledge: false, enableResponseOptions: false,
                enableAnalysis: false, enableJournal: false, enableStats: false, enableLivingPersona: false });
            document.getElementById('chat-input').value = '';
        });
        await page.click('#player-sheet-btn');
        assert.equal(await page.inputValue('#live-player-personality'), personality);
        await page.fill('#live-player-personality', changed);
        await page.evaluate(() => UIManager.renderInventoryPanel());
        assert.equal(await page.inputValue('#live-player-personality'), changed);
        for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
            await page.setViewportSize(viewport);
            await page.evaluate(() => app.updateLayout());
            await page.locator('#live-player-personality').scrollIntoViewIfNeeded();
            assert.equal(await page.locator('#live-player-form').evaluate(el => el.scrollWidth <= el.clientWidth + 1), true);
            await page.screenshot({ path: path.resolve(__dirname, `../dist/personality-${viewport.width}.png`) });
        }
        await page.click('[data-action="save-player-sheet"]');
        await page.waitForFunction(changed => ReactiveStore.state.playerCharacter.personality === changed, changed);
        assert.equal(await page.evaluate(() => ReactiveStore.state.characters.find(c => c.is_user).personality), changed);
        await page.evaluate(() => ReactiveStore.forceSave());
        await page.reload();
        await page.waitForFunction(() => typeof ReactiveStore !== 'undefined' && !!ReactiveStore.state?.narrativeId);
        assert.equal(await page.evaluate(() => ReactiveStore.state.playerCharacter.personality), changed);
        const saved = await page.evaluate(async ({ fixture, runs }) => ({
            scenario: (await DBService.getStory(fixture.storyId)).scenarios.find(s => s.id === fixture.scenarioId).playerCharacter.personality,
            other: (await DBService.getNarrative(runs.second)).state.playerCharacter.personality
        }), { fixture, runs });
        assert.deepEqual(saved, { scenario: personality, other: personality });
        await page.evaluate(() => {
            NarrativeController._isModelConfigured = () => true;
            window.suggestionCalls = [];
            window.sentDrafts = [];
            NarrativeController.sendMessage = async () => window.sentDrafts.push(document.getElementById('chat-input').value);
            APIService.callAI = async prompt => {
                window.suggestionCalls.push(prompt);
                return JSON.stringify([{ label: 'Offer help', prompt: 'I crouch beside her. "Can I help?"' }]);
            };
            ReactiveStore.state.prompt_response_options_gen = 'Older saved prompt: generate options for {user_character}. Context: {context}. Latest: {last_response}.';
            ReactiveStore.state.enableResponseOptions = true;
        });
        for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
            await page.setViewportSize(viewport);
            await page.evaluate(() => app.updateLayout());
            await page.evaluate(() => NarrativeController.generateResponseOptions());
            const snapshot = await page.evaluate(() => JSON.stringify({ history: ReactiveStore.state.chat_history, player: ReactiveStore.state.playerCharacter }));
            const count = await page.evaluate(() => window.suggestionCalls.length);
            const prompt = await page.evaluate(() => window.suggestionCalls.at(-1));
            assert.ok(prompt.includes(changed));
            assert.match(prompt, /personality.*(?:voice|speech)|(?:voice|speech).*personality/is);
            assert.ok(!prompt.includes('[NPC_MET:'));
            assert.ok(!prompt.includes('[CHECK:'));
            await page.locator('#response-options-container button').click();
            assert.equal(await page.inputValue('#chat-input'), 'I crouch beside her. "Can I help?"');
            assert.deepEqual(await page.evaluate(() => window.sentDrafts), []);
            assert.equal(await page.evaluate(() => window.suggestionCalls.length), count);
            assert.equal(await page.evaluate(() => JSON.stringify({ history: ReactiveStore.state.chat_history, player: ReactiveStore.state.playerCharacter })), snapshot);
            assert.equal(await page.locator('#chat-input-container').evaluate(el => el.classList.contains('cyoa-shrunk')), false);
        }
        await page.fill('#chat-input', 'I offer her water instead.');
        await page.click('#primary-action-btn');
        assert.deepEqual(await page.evaluate(() => window.sentDrafts), ['I offer her water instead.']);
        const contexts = await page.evaluate(() => {
            const state = ReactiveStore.state;
            const user = state.characters.find(c => c.is_user);
            return { normal: PromptBuilder.buildPlayerContext(state), write: PromptBuilder.buildPrompt(user.id, true) };
        });
        assert.ok(contexts.normal.includes(changed));
        assert.ok(JSON.stringify(contexts.write).includes(changed));
        await page.evaluate(() => {
            window.suggestionCalls = [];
            APIService.callAI = async prompt => { window.suggestionCalls.push(prompt); return 'I offer a reassuring smile.'; };
            document.getElementById('chat-input').value = '';
        });
        await page.evaluate(() => NarrativeController.handleBoltAction());
        assert.equal(await page.inputValue('#chat-input'), 'I offer a reassuring smile.');
        assert.ok(await page.evaluate(changed => JSON.stringify(window.suggestionCalls[0]).includes(changed), changed));
        assert.equal(await page.evaluate(() => window.suggestionCalls.length), 1);
        assert.equal(await page.evaluate(() => window.sentDrafts.length), 1);
        assert.deepEqual(errors, []);
        process.stdout.write('Player personality, scenario/run isolation, prompt guidance, reviewable suggestions, and responsive editors passed.\n');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
