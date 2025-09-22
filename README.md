# ...Ellipsis LM

## Core Functionality
This is a self-contained web application for multi-character, AI-driven roleplaying and storytelling, designed to run entirely within a single HTML file. The interface is centered around a chat log where the user embodies one character and interacts with multiple AI-controlled characters.

**Multi-Character Interaction:** The user can create and manage a full cast of characters. Any character not designated as the "player" can be selected from a dropdown menu for the AI to respond as, allowing for dynamic scene changes and conversations.

**Standard Chat Controls:** The application includes essential controls for managing the flow of the story:

**Send / Write for Me:** A primary action button that either sends the user's written message or, if the input is empty, uses the AI to generate a suggested response for the user's character.

**Regenerate:** Prompts the currently selected AI character to generate a new response, replacing its previous turn.

**Undo:** Removes the most recent message from the chat log, whether it was from the user or the AI.

**Message Editing:** Every message in the chat history can be directly edited, allowing for corrections or retroactive changes to the narrative.
## AI & Prompt Engineering
The application provides extensive control over the AI's behavior and the context it receives.

**Multi-Provider Support:** Users can connect to different AI services by selecting their preferred provider and entering the corresponding API key. The app supports:
- Google Gemini
- OpenRouter (which provides access to a wide range of models)
- A local KoboldCPP instance
## System & Event Prompts:

**System Prompt:** A global instruction field that sets the overall tone, genre, writing style, and rules for the AI's responses.

**Event Master Prompt:** A secondary AI instruction that periodically triggers, injecting unexpected events or plot twists into the narrative to keep the story dynamic.

**Raw Prompt Viewer:** For advanced users, a modal allows viewing the exact, fully constructed prompt that is sent to the AI for any given turn. This includes the system prompt, character descriptions, active knowledge entries, and recent chat history.
## Content & World-Building
The application is built around a robust system for creating and managing narrative content.

**Story Library:** The entire application is session-based around "stories." Users can create, duplicate, rename, and delete multiple stories. Each story is a self-contained save state that includes its own unique cast of characters, knowledge base, settings, and chat history.

**Character Roster:** A dedicated modal allows for the detailed creation of characters. Each character has:
- A name and detailed description/persona.
- A primary image URL.
- A set of secondary "emotional portraits" (e.g., happy, angry) that can be triggered by the AI's sentiment analysis of its own responses.
- Knowledge Base (Static & Dynamic): This two-part system functions as the AI's memory and world bible.
 - Static: These are wiki-style entries containing core information (locations, history, rules) that are always included in the AI's context.
 - Dynamic: This is a lorebook system where entries are only injected into the context when specific conditions are met. Triggers can be a list of keywords or a percentage chance. It supports boolean logic, allowing keywords to be linked with AND (all words must be present) or OR (any word must be present) to trigger the entry.
## Customization & User Interface
The visual experience is highly customizable and responsive.

**Responsive Layout:** The interface automatically adapts based on the screen's aspect ratio.

**Horizontal View (Desktop):** A classic layout with the chat area occupying two-thirds of the screen and a dedicated panel for displaying a large character portrait on the right.

**Vertical View (Mobile):** An immersive, full-screen chat experience. The outer framing is removed, and the story title becomes a temporary, editable overlay that appears on touch. The main menu is condensed into a floating, semi-transparent hamburger icon.
## Appearance Settings:

**Theming:** Users can change the chat font, text color, bubble opacity, and set a global background image URL.

**Image Modes:** Character images can be displayed in several ways: Cinematic (a large, centered background image), Bubble (a small, wrapped image inside the chat bubble), or None.
## Data Management
All data is stored locally in the browser, requiring no external server.

**Import/Export:** Users have full control over their data.
Individual stories can be exported to, and imported from, .json files.
The entire library of all stories can be saved to, or completely replaced by, a single .json file.

**BYAF Compatibility:** The app supports the "Build Your Own Adventure Format" standard, allowing users to import character and scenario data from .zip files.


Try it now:
https://pacmanincarnate.github.io/EllipsisLM/

