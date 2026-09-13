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
        const fixture = await page.evaluate(async () => {
            const story = await StoryService.createNewStory();
            const veteran = { id: UTILITY.uuid(), name: 'Veteran', description: 'Authored guard.', is_active: false,
                npc_profile: { ...UTILITY.createNpcProfile('Veteran', 'Guard', story.id), level: 9, abilities: Object.fromEntries(UTILITY.playerAbilities.map(key => [key, 20])) } };
            story.characters.push(veteran);
            const unprofiled = { id: UTILITY.uuid(), name: 'Apprentice', description: 'An authored apprentice with no generated sheet.', is_active: false };
            story.characters.push(unprofiled);
            story.scenarios[0].worldMap = { grid: UTILITY.createDefaultMapGrid(), currentLocation: { x: 4, y: 4 } };
            const local = { id: UTILITY.uuid(), name: 'Local Guard', npc_profile: { ...UTILITY.createNpcProfile('Local Guard', 'Guard', story.id), level: 5 } };
            story.scenarios[0].worldMap.grid[0].characters = [local];
            StateManager.getLibrary().stories.push(story);
            await DBService.saveStory(story);
            await LibraryController.editScenario(story.id, story.scenarios[0].id);
            return { story: story.id, scenario: story.scenarios[0].id, veteran: veteran.id, local: local.id, unprofiled: unprofiled.id };
        });
        await page.click('[data-action="scenario-player-tab"]');
        assert.equal(await page.locator('#scenario-player-rpg-enabled').isChecked(), false);
        await page.check('#scenario-player-rpg-enabled');
        await page.fill('#scenario-player-rpg-startingLevel', '3');
        await page.fill('#scenario-player-rpg-startingPoints', '4');
        await page.fill('#scenario-player-rpg-pointsPerLevel', '3');
        await page.locator('#scenario-player-rpg-pointsPerLevel').blur();
        assert.match(await page.locator('#scenario-player-rpg-allocation').textContent(), /10 attribute points available/);
        await page.click('[data-action="spend-rpg-point"][data-prefix="scenario-player"][data-ability="dexterity"]');
        await page.click('[data-action="spend-rpg-point"][data-prefix="scenario-player"][data-ability="dexterity"]');
        assert.match(await page.locator('#scenario-player-rpg-allocation').textContent(), /8 attribute points available/);
        assert.equal(await page.locator('#scenario-player-diceEnabled').isChecked(), false);
        await page.evaluate(() => LibraryController.saveScenario());
        const ids = await page.evaluate(async fixture => {
            const first = await StoryService.createNarrativeFromScenario(fixture.story, fixture.scenario);
            const second = await StoryService.createNarrativeFromScenario(fixture.story, fixture.scenario);
            StateManager.getLibrary().active_story_id = fixture.story;
            StateManager.getLibrary().active_narrative_id = first.id;
            StateManager.saveLibrary();
            return { first: first.id, second: second.id };
        }, fixture);
        await page.reload();
        await page.waitForFunction(() => typeof ReactiveStore !== 'undefined' && !!ReactiveStore.state?.narrativeId);
        const installMocks = () => page.evaluate(() => {
            Object.assign(ReactiveStore.state, { enableAutoStaticKnowledge: false, enableAnalysis: false, enableJournal: false,
                enableStats: false, enableResponseOptions: false, enableLivingPersona: false });
            window.rpgCalls = 0;
            APIService.callAI = async () => { rpgCalls++; throw new Error('RPG progression must be local'); };
            NarrativeController.analyzeTurn = async () => ({});
            NarrativeController.applyAnalysisResults = () => {};
            TextModeController.deliverUnprompted = () => {};
            VisualMaster.checkTrigger = () => {};
            window.rpgSample = 19;
            const random = crypto.getRandomValues.bind(crypto);
            crypto.getRandomValues = values => values instanceof Uint32Array && values.length === 1 ? (values[0] = window.rpgSample, values) : random(values);
        });
        await installMocks();
        assert.equal(await page.evaluate(() => ReactiveStore.state.playerCharacter.level), 3);
        assert.equal(await page.evaluate(() => ReactiveStore.state.playerCharacter.abilities.dexterity), 10);
        assert.equal(await page.evaluate(() => ReactiveStore.state.playerCharacter.diceEnabled), false);
        await page.click('#scenario-settings-btn');
        assert.equal(await page.locator('#live-settings-rpg-startingLevel').isDisabled(), true);
        await page.check('#live-settings-diceEnabled');
        await page.click('[data-action="save-scenario-settings"]');
        await page.locator('#scenario-settings-modal').waitFor({ state: 'hidden' });
        await page.evaluate(() => {
            const narrator = ReactiveStore.state.characters.find(char => !char.is_user);
            NarrativeController.startStreamingResponse(narrator.id, 'Captain Bram arrives. [NPC_MET: Bram|guard|A scarred guard in a mail coat.|5]', 'neutral');
        });
        const npcData = await page.evaluate(fixture => {
            NarrativeController.syncRpgNpcs();
            const state = ReactiveStore.state;
            const all = [...state.characters, ...state.worldMap.grid.flatMap(tile => tile.characters || [])];
            return [all.find(char => char.id === fixture.veteran), all.find(char => char.id === fixture.local), all.find(char => char.name === 'Bram')].map(char => {
                const profile = NarrativeController.getNpcProfile(char);
                return { id: char.id, level: profile.level, spent: Object.values(profile.abilities).reduce((a, b) => a + b - 8, 0), abilities: profile.abilities };
            });
        }, fixture);
        assert.deepEqual(npcData.map(npc => [npc.level, npc.spent]), [[9, 28], [5, 16], [5, 16]]);
        await page.evaluate(() => {
            const narrator = ReactiveStore.state.characters.find(char => !char.is_user);
            NarrativeController.startStreamingResponse(narrator.id, 'Bram waits. [NPC_MET: Bram|guard||99]', 'neutral');
        });
        assert.equal(await page.evaluate(() => NarrativeController.getNpcProfile(ReactiveStore.state.characters.find(char => char.name === 'Bram')).level), 5);
        await page.evaluate(id => AppController.openModal('character-detail-modal', id), fixture.unprofiled);
        assert.equal(await page.locator('#tab-character-sheet [data-field="strength"]').isDisabled(), true);
        assert.match(await page.locator('#tab-character-sheet').textContent(), /RPG progression/);
        await page.evaluate(() => AppController.closeModal('character-detail-modal'));
        await page.evaluate(id => AppController.openModal('character-detail-modal', id), npcData[0].id);
        assert.equal(await page.locator('#tab-character-sheet [data-field="level"]').isDisabled(), true);
        assert.equal(await page.locator('#tab-character-sheet [data-field="strength"]').isDisabled(), true);
        await page.evaluate(id => NarrativeController.updateNpcProfile(id, 'strength', '999'), npcData[0].id);
        assert.equal(await page.inputValue('#tab-character-sheet [data-field="strength"]'), String(npcData[0].abilities.strength));
        await page.evaluate(() => AppController.closeModal('character-detail-modal'));
        await page.click('#player-sheet-btn');
        await page.click('[data-action="open-player-stats"]');
        assert.equal(await page.locator('[data-action="refund-rpg-point"]').count(), 0);
        for (let i = 0; i < 8; i++) await page.click('[data-action="spend-rpg-point"][data-ability="strength"]');
        assert.match(await page.locator('[data-rpg-points]').textContent(), /^0 /);
        assert.equal(await page.locator('[data-action="spend-rpg-point"][data-ability="strength"]').isDisabled(), true);
        await page.evaluate(() => UIManager.changeRpgAllocation('live-stats', 'strength', 1));
        assert.equal(await page.evaluate(() => ReactiveStore.state.playerCharacter.abilities.strength), 16);
        fs.mkdirSync(path.resolve(__dirname, '../dist/rpg-qa'), { recursive: true });
        await page.addStyleTag({ content: '#notification-container { visibility: hidden; }' });
        for (const size of [{ width: 1440, height: 900 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
            await page.setViewportSize(size);
            await page.evaluate(() => app.updateLayout());
            await page.locator('#notification-container').evaluateAll(elements => elements.forEach(el => el.replaceChildren()));
            assert.equal(await page.locator('#live-stats-rpg-allocation').evaluate(el => el.scrollWidth <= el.clientWidth + 1), true);
            await page.screenshot({ path: path.resolve(__dirname, `../dist/rpg-qa/player-${size.width}.png`) });
        }
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.click('[data-action="close-inventory-panel"]');
        const roll = (sample = 19, skip = false) => page.evaluate(async ({ sample, skip }) => {
            window.rpgSample = sample;
            const narrator = ReactiveStore.state.characters.find(char => !char.is_user);
            NarrativeController.startStreamingResponse(narrator.id, 'A risky leap. [CHECK: dexterity|15|Cross the ravine]', 'neutral');
            await NarrativeController.resolvePendingPlayerCheck(skip, false);
            return JSON.parse(JSON.stringify(ReactiveStore.state.chat_history.at(-1)));
        }, { sample, skip });
        const failed = await roll(0);
        assert.equal(failed.rpgAward.xp, 5);
        const success = await roll();
        assert.equal(success.rpgAward.xp, 150);
        assert.equal(await page.evaluate(() => ReactiveStore.state.playerCharacter.progression.xp), 155);
        const leveled = await roll();
        assert.equal(leveled.rpgAward.levels, 1);
        assert.equal(await page.evaluate(() => ReactiveStore.state.playerCharacter.level), 4);
        assert.equal(await page.evaluate(() => UTILITY.rpgAvailablePoints(ReactiveStore.state.playerCharacter.progression)), 3);
        assert.match(await page.locator('.dice-result-card').last().textContent(), /\+150 XP.*Level 4 reached/);
        await page.evaluate(() => NarrativeController.resolvePendingPlayerCheck(false, false));
        assert.equal(await page.evaluate(() => ReactiveStore.state.playerCharacter.progression.xp), 5);
        const skipped = await roll(19, true);
        assert.equal(skipped.rpgAward, undefined);
        await page.evaluate(() => NarrativeController.rewindPlayerTime([ReactiveStore.state.chat_history.findLast(message => message.rpgAward)]));
        assert.equal(await page.evaluate(() => ReactiveStore.state.playerCharacter.level), 3);
        assert.equal(await page.evaluate(() => ReactiveStore.state.playerCharacter.progression.xp), 155);
        await page.click('#scenario-settings-btn');
        await page.fill('#live-settings-rpg-maxLevel', '3');
        await page.locator('#live-settings-rpg-maxLevel').blur();
        await page.click('[data-action="save-scenario-settings"]');
        await page.locator('#scenario-settings-modal').waitFor({ state: 'hidden' });
        assert.equal((await roll()).rpgAward, undefined);
        const capped = await page.evaluate(() => Object.values(ReactiveStore.state.npcProgression).map(entry => [entry.progression.level, Object.values(entry.progression.allocations).reduce((a, b) => a + b, 0)]));
        assert.ok(capped.every(([level, points]) => level <= 3 && points === 4 + (level - 1) * 3));
        const stored = await page.evaluate(async ids => {
            await ReactiveStore.forceSave();
            return { first: (await DBService.getNarrative(ids.first)).state, second: (await DBService.getNarrative(ids.second)).state, calls: window.rpgCalls };
        }, ids);
        assert.equal(stored.calls, 0);
        assert.equal(stored.first.playerCharacter.abilities.strength, 16);
        assert.equal(stored.second.playerCharacter.abilities.strength, 8);
        assert.deepEqual(stored.second.npcProgression, {});
        await page.reload();
        await page.waitForFunction(() => typeof ReactiveStore !== 'undefined' && ReactiveStore.state?.playerCharacter?.progression?.maxLevel === 3);
        await installMocks();
        assert.equal(await page.evaluate(() => ReactiveStore.state.playerCharacter.abilities.strength), 16);
        await page.click('#scenario-settings-btn');
        await page.uncheck('#live-settings-rpg-enabled');
        await page.click('[data-action="save-scenario-settings"]');
        await page.locator('#scenario-settings-modal').waitFor({ state: 'hidden' });
        assert.equal((await roll()).rpgAward, undefined);
        assert.equal(await page.evaluate(id => NarrativeController.getNpcProfile(ReactiveStore.state.characters.find(char => char.id === id)).level, fixture.veteran), 9);
        const authored = await page.evaluate(async id => (await DBService.getStory(ReactiveStore.state.id)).characters.find(char => char.id === id).npc_profile.abilities, fixture.veteran);
        assert.ok(Object.values(authored).every(score => score === 20));
        assert.deepEqual(errors, []);
        console.log('RPG progression passed: opt-in, scenario allocation, player XP, failures/skips/caps, duplicate prevention, rewind, NPC/world budgets, protected stats, persistence, isolation, local execution, and responsive UI.');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
