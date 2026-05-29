const { chromium } = require('playwright');
const path = require('path');

(async () => {
  console.log('Starting Playwright test for VN Mode...');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  // Dismiss onboarding beforehand
  await page.addInitScript(() => {
    localStorage.setItem('onboarding_dismissed', 'true');
  });

  // Load the monolithic index.html to seed the database
  const indexPath = path.resolve(__dirname, '../index.html');
  console.log('Loading file to seed database:', indexPath);
  await page.goto('file://' + indexPath);
  
  // Wait for the app to seed and settle
  await page.waitForTimeout(4000);
  
  // Reload page so that StateManager can load the seeded story/narrative on launch
  console.log('Reloading page to hydrate seeded narrative state...');
  await page.reload();
  await page.waitForTimeout(3000);

  const storeStateBefore = await page.evaluate(() => {
      return {
          hasState: !!ReactiveStore.state,
          keys: ReactiveStore.state ? Object.keys(ReactiveStore.state) : [],
          hasChatHistory: !!(ReactiveStore.state && ReactiveStore.state.chat_history),
          chatHistoryLength: ReactiveStore.state && ReactiveStore.state.chat_history ? ReactiveStore.state.chat_history.length : 0
      };
  });
  console.log('ReactiveStore state diagnostics before toggle:', storeStateBefore);

  console.log('Toggling VN mode...');
  await page.evaluate(() => {
      ReactiveStore.state.characterImageMode = 'visual_novel';
      UIManager.renderChat();
  });
  
  const storeStateAfter = await page.evaluate(() => {
      return {
          characterImageMode: ReactiveStore?.state?.characterImageMode,
          hasChatHistory: !!(ReactiveStore.state && ReactiveStore.state.chat_history),
          chatHistoryLength: ReactiveStore.state && ReactiveStore.state.chat_history ? ReactiveStore.state.chat_history.length : 0
      };
  });
  console.log('ReactiveStore state diagnostics after toggle:', storeStateAfter);

  const bodyMode = await page.evaluate(() => {
      return {
          bodyDatasetMode: document.body.dataset.mode,
          bodyClassList: Array.from(document.body.classList),
          chatWindowExists: !!document.getElementById('chat-window'),
          chatAreaIsHidden: document.getElementById('chat-window-container')?.classList.contains('hidden'),
          vnHudExists: !!document.getElementById('vn-hud'),
          vnHudDisplay: window.getComputedStyle(document.getElementById('vn-hud')).display
      };
  });
  console.log('Body mode and layout:', bodyMode);

  const vnHudRect = await page.evaluate(() => {
      const el = document.getElementById('vn-hud');
      const rect = el.getBoundingClientRect();
      return {
          width: rect.width,
          height: rect.height,
          display: window.getComputedStyle(el).display,
          opacity: window.getComputedStyle(el).opacity,
          visibility: window.getComputedStyle(el).visibility,
          classList: Array.from(el.classList),
          parentDisplay: window.getComputedStyle(el.parentElement).display,
          parentWidth: el.parentElement.getBoundingClientRect().width,
          parentHeight: el.parentElement.getBoundingClientRect().height
      };
  });
  console.log('vn-hud rect and style:', vnHudRect);

  // Check if vn-hud container is visible
  const vnHud = await page.locator('#vn-hud');
  const isVisible = await vnHud.isVisible();
  console.log('Is #vn-hud visible?', isVisible);
  
  if (!isVisible) {
      console.error('Test Failed: #vn-hud is not visible in VN mode.');
      process.exit(1);
  }
  
  // Verify that vn-sprites-container is present inside #vn-container
  const spritesContainer = await page.locator('#vn-container #vn-sprites-container');
  const spritesExist = await spritesContainer.count() > 0;
  console.log('Does vn-sprites-container exist?', spritesExist);
  
  if (!spritesExist) {
      console.error('Test Failed: #vn-sprites-container not found.');
      process.exit(1);
  }

  // Verify that visual-novel-overlay is present (wait, is there a visual-novel-overlay in the DOM?
  // Let's check vn-container instead, which is the main VN mode overlay container!)
  const overlayExists = await page.locator('#vn-container').count() > 0;
  console.log('Does vn-container exist?', overlayExists);

  if (!overlayExists) {
      console.error('Test Failed: vn-container not found.');
      process.exit(1);
  }

  console.log('Testing dynamic sprite casting by recency...');
  const spriteUrls = await page.evaluate(() => {
      // 1. Setup 5 characters plus 1 user
      const chars = [
          { id: 'user-id', name: 'Adventurer', is_user: true, is_active: true, is_narrator: false, image_url: 'user.png' },
          { id: 'char-a', name: 'Alice', is_user: false, is_active: true, is_narrator: false, image_url: 'alice.png' },
          { id: 'char-b', name: 'Bob', is_user: false, is_active: true, is_narrator: false, image_url: 'bob.png' },
          { id: 'char-c', name: 'Charlie', is_user: false, is_active: true, is_narrator: false, image_url: 'charlie.png' },
          { id: 'char-d', name: 'Diana', is_user: false, is_active: true, is_narrator: false, image_url: 'diana.png' },
          { id: 'char-e', name: 'Emily', is_user: false, is_active: true, is_narrator: false, image_url: 'emily.png' }
      ];
      ReactiveStore.state.characters = chars;

      // 2. Setup chat history (most recent are D, C, B in that order)
      ReactiveStore.state.chat_history = [
          { id: 'msg-1', type: 'chat', character_id: 'char-a', content: 'Hello from Alice.' },
          { id: 'msg-2', type: 'chat', character_id: 'char-b', content: 'Hello from Bob.' },
          { id: 'msg-3', type: 'chat', character_id: 'char-c', content: 'Hello from Charlie.' },
          { id: 'msg-4', type: 'chat', character_id: 'char-d', content: 'Hello from Diana.' }
      ];

      // Re-trigger visual novel UI update
      ReactiveStore.state.characterImageMode = 'visual_novel';
      UIManager.updateVisualNovelModeUI(ReactiveStore.state);

      // Get rendered sprite img sources
      const container = document.getElementById('vn-sprites-container');
      const imgs = Array.from(container.querySelectorAll('.vn-sprite'));
      return imgs.map(img => img.getAttribute('src'));
  });

  console.log('Rendered sprite portrait sources:', spriteUrls);

  // Since Bob, Charlie, and Diana are selected and then sorted alphabetically,
  // the expected sources are: ['bob.png', 'charlie.png', 'diana.png']
  const expected = ['bob.png', 'charlie.png', 'diana.png'];
  const matches = spriteUrls.length === expected.length && spriteUrls.every((val, index) => val === expected[index]);
  if (!matches) {
      console.error('Test Failed: Expected sprites to be exactly Bob, Charlie, Diana in alphabetical order, but got:', spriteUrls);
      process.exit(1);
  }
  console.log('Dynamic sprite casting test passed!');

  console.log('Testing dynamic sprite casting with inactive last speaker...');
  const spriteUrlsInactiveSpeaker = await page.evaluate(() => {
      // 1. Setup 5 characters plus 1 user, Emily is inactive
      const chars = [
          { id: 'user-id', name: 'Adventurer', is_user: true, is_active: true, is_narrator: false, image_url: 'user.png' },
          { id: 'char-a', name: 'Alice', is_user: false, is_active: true, is_narrator: false, image_url: 'alice.png' },
          { id: 'char-b', name: 'Bob', is_user: false, is_active: true, is_narrator: false, image_url: 'bob.png' },
          { id: 'char-c', name: 'Charlie', is_user: false, is_active: true, is_narrator: false, image_url: 'charlie.png' },
          { id: 'char-d', name: 'Diana', is_user: false, is_active: true, is_narrator: false, image_url: 'diana.png' },
          { id: 'char-e', name: 'Emily', is_user: false, is_active: false, is_narrator: false, image_url: 'emily.png' }
      ];
      ReactiveStore.state.characters = chars;

      // 2. Setup chat history: Alice -> Bob -> Diana -> Emily (last responder, inactive)
      ReactiveStore.state.chat_history = [
          { id: 'msg-1', type: 'chat', character_id: 'char-a', content: 'Hello from Alice.' },
          { id: 'msg-2', type: 'chat', character_id: 'char-b', content: 'Hello from Bob.' },
          { id: 'msg-3', type: 'chat', character_id: 'char-d', content: 'Hello from Diana.' },
          { id: 'msg-4', type: 'chat', character_id: 'char-e', content: 'Hello from Emily.' }
      ];

      // Re-trigger visual novel UI update
      ReactiveStore.state.characterImageMode = 'visual_novel';
      UIManager.updateVisualNovelModeUI(ReactiveStore.state);

      // Get rendered sprite img sources
      const container = document.getElementById('vn-sprites-container');
      const imgs = Array.from(container.querySelectorAll('.vn-sprite'));
      return imgs.map(img => img.getAttribute('src'));
  });

  console.log('Rendered sprite portrait sources (inactive speaker test):', spriteUrlsInactiveSpeaker);

  // Since Bob, Diana, and Emily (even though inactive) are selected and then sorted alphabetically,
  // the expected sources are: ['bob.png', 'diana.png', 'emily.png']
  const expectedInactiveTest = ['bob.png', 'diana.png', 'emily.png'];
  const matchesInactiveTest = spriteUrlsInactiveSpeaker.length === expectedInactiveTest.length && 
                               spriteUrlsInactiveSpeaker.every((val, index) => val === expectedInactiveTest[index]);
  if (!matchesInactiveTest) {
      console.error('Test Failed: Expected sprites to be exactly Bob, Diana, Emily in alphabetical order, but got:', spriteUrlsInactiveSpeaker);
      process.exit(1);
  }
  console.log('Inactive last speaker casting test passed!');

  console.log('Test Passed Successfully!');
  await browser.close();
})();
