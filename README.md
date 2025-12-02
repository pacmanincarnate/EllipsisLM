# ...Ellipsis LM

## Overview
EllipsisLM is an open-source front-end for AI-powered roleplay. It runs as a single HTML file that can be saved locally and will store your entire library in your web browser’s local cache.

Try it now:
https://pacmanincarnate.github.io/EllipsisLM/

<img width="1620" height="2160" alt="image" src="https://github.com/user-attachments/assets/ff833d71-573b-4513-a185-b626193c5722" />


## Getting Started
- Download the index.html file to your computer and open it in any browser.
- Go to Import/Export to bring in a V2 Tavern Card PNG or BYAF character.
- In your imported story card, create a new "Narrative" from the "Scenario" template (the plus sign)
- Start the roleplay with the green up arrow button.
- Go to settings and into the model tab. Input your Gemini or OpenRouter API and model selection, **or** select koboldcpp or LM Studio for local generation.
- Start chatting!
- **For local generation (Koboldcpp):** Go to https://github.com/LostRuins/koboldcpp/releases and download the latest koboldcpp release. Run the exe and select your model. Return to EllipsisLM.
- **For local generation (LM Studio):**
  1. Download and install LM Studio from https://lmstudio.ai/
  2. Load a model in LM Studio
  3. Start the local server (click the server icon ⬅️➡️)
  4. **Important:** Enable CORS in LM Studio's server settings (look for "Enable CORS" or "Allow cross-origin requests" checkbox)
  5. In EllipsisLM settings, select "LM Studio" and use the default URL: http://localhost:1234

## Backend
The app supports multiple AI backends:
- **Gemini API** - Google's cloud-based AI (requires API key)
- **OpenRouter API** - Access to multiple AI models (requires API key, some free options available)
- **Koboldcpp** - Local generation, none of your information leaves your computer. Quick and easy to install, uses GGUF-format models.
- **LM Studio** - Local generation with a user-friendly interface. Download models and run them locally with no cloud services.

For local backends (Koboldcpp and LM Studio), all processing happens on your computer with complete privacy.

### Mobile and desktop browser support
The app is a single HTML file that requires no installation and works on mobile and desktop. To use on mobile, access it through the GitHub site. For desktop use, you can either use the GitHub site or download the HTML file (a download may be required for Koboldcpp support).

## Import and Export
EllipsisLM includes ample import and export functionality, allowing for the import and export of V2 PNG cards, BYAF format cards, or the app’s own JSON format. There is an additional option to save your entire library in a single backup. A special import option automatically imports every PNG or BYAF card from a folder, enabling a quick transition.

## Stories, Scenarios, Narratives, Characters
EllipsisLM stores your roleplays in a slightly unique format.

### Stories
Stories are the highest-level container for roleplay information. In BY and other front ends, Stories are akin to character cards.

### Scenarios
Scenarios are the different versions of a roleplay and serve as templates for each playthrough (Narratives). Scenarios can include unique memories, visual settings, characters, and first messages.

### Narratives
Narratives start from a Scenario. These are your actual play-throughs and are stored uniquely from the templates. If you make changes to a narrative you really like, you can elevate it to a scenario template for future use.

## Story Library
The story library presents you with a list of all of your stories. These can be filtered, searched, and sorted, allowing you to quickly find the story you are looking for. The intent is to replace the card organization with on-the-fly sorting using their data. Rather than putting all your elves into one folder, you can apply an elf tag to every character that is an elf and filter by that tag.

## Characters
A role-play can have any number of characters. You can add them through the character model. Each character contains a set of images, their own model instructions, and their persona, as well as tags and a brief description. Because you can have an unlimited number of characters, there are two unique toggles. One is to activate a character or to make it inactive. In a character name, the character can respond. The second toggle turns a character into a narrator. A narrator will periodically respond in the role-play, but never respond twice in a row. This allows for narration to occasionally interject movement in the story without the narrator taking over.

## Roleplay Interface
This is where you partake in your roleplay. The roleplay interface is similar to other front-end chat applications, with a few unique elements.
## Generate/Write for me
The generate button serves three functions. When you’ve written your response, click here to send that response and begin the generation of the following character response. If you don’t have a blank user response field, however, clicking this button will generate a new user response for you. Once a response is generated, this button turns into a stop button.

### Character Drop Down
Here you can select which character will respond, or choose “any” to let the system decide. This drop-down is only visible when there are more than two non-user characters.

### Regenerate
The regenerate button will perform two functions, depending on which character is selected from the drop-down. If the same character that responded last is selected, the regenerate button will remove that response and write a new one. If a different character is selected than the last responded, the button will craft a new response for the selected character. This lets you control who responds when, while also letting you regenerate responses.

## Location
EllipsisLM includes an optional location system that can add a new dimension of complexity to your roleplay. The World map consists of an 8x8 grid. Each space can have a name, a short description, a long description, and a memory. As a creator, you can define each space in the map, or let the AI generate the map for you automatically. Then, your roleplay will take place in a location, with an understanding of the locations around you. If you move locations, the system will periodically try to determine where you are and make the jump. You can also manually change locations through the Location tab, or jump further using the world map. Additionally, since many roleplays involve a journey, you can set a destination, and the system will map the path between you and that location, giving you an idea of what your journey will entail and adding a level of immersion.

## Knowledge
### Static knowledge
Static knowledge will always be in context. It is stored as a title and a description. You can manually manage and update these, or use the Update Static button to have the LLM automatically generate new knowledge. Use this for scenario, summarization, world-building, etc.

### Dynamic Knowledge 
The EllipsisLM form of lorebook. Individual entries have a title, keywords, and description. These entries are entered into context when triggered by the keyword field. EllipsisLM supports basic keywords, AND/XOR logic between keywords, and a percentage chance, all through the keyword field. This allows you to easily create complex trigger conditions.


## Agents
### Event Master
EllipsisLM includes a special agent that runs every 6 turns. This prompt exists outside of your roleplay and uses your current chat history and a customizable prompt. The response to this prompt is then inserted into the roleplay context in the background. The default use for this is to ask the LLM to come up with something logical but unexpected that could happen, to make the roleplay less predictable and static.

### Sentiment
A separate LLM call can be used to determine the sentiment of the character, so that the system can change the character portrait if you have given it multiple sentiment images. It does this automatically every few turns.

### AI-Generate
Many fields in the app include a small icon that sends the field's context, along with a customizable prompt, to the model to generate information for that field. This can be used to automate the creation of a character persona, for instance, based on a basic description. Write out “Sarah is a brunette with a cat named Bob”, hit generate, and let the model draft a fleshed-out character description.

### Static Memory Creation
EllipsisLM can store static (always in context) memories automatically, based on the current chat context. The state determines what important events have occurred and creates new entries for them.

### World Map Generation
The model will attempt to create the 8x8 map of locations with descriptions, based on your static memory and a customizable prompt.

## Interface Customization
EllipsisLM offers several visual customization options.

### Appearance settings
Background image
Character chat bubble color
Text color, size, and font
Chat Bubble opacity
Background image blur

### View Options
**Default:** In vertical orientation, no character images are used. In horizontal orientation, a large character portrait floats to the right of the chat.
**Cinematic:** character image fills the window height, and text is constrained to the bottom ⅓ of the screen.
**Bubble (poorly named):** The character images are visible within the chat bubble, and their size is customizable.

### Orientation
EllipsisLM supports mobile and desktop, and the way this is accomplished offers expanded choices for everyone. When the window is taller than wide, it switches to a condensed ‘mobile’ mode with a more minimal UI. When the window is wider than it is tall, the interface spreads out for easier access and displays the character image.


# Roadmap
## Complete
- [X] Clarify Story Library as a separate component from other roleplay-specific controls. (11/3/25)
- [X] Establish model settings outside of a narrative and make them persistent. (11/3/25)
- [X] Add a scroll bar in horizontal mode. (11/3/25)
- [X] Adjust the background image to fit vertically. (11/3/25)
- [X] Improve positioning of dynamic knowledge in prompt. (11/9/25)
- [X] Make example dynamic knowledge entry not 100%. (11/9/25)
- [X] shift 'character is thinking' to the left to align with other bubbles. (11/9/25)
- [X] Add sequential dynamic knowledge. (11/10/25)
- [X] Add periodic static knowledge gen; seems to be missing. (11/10/25)
- [X] add field for story creator's note.
- [X] add field for story tags
- [X] Add possible fix for Android keyboard overlap.

## To Do
- [ ] Investigate alternative character response formats
- [ ] Properly incorporate Llama 3 syntax for koboldcpp
- [ ] Implement thinking model support
- [ ] Make the Event Master more customizable.
- [ ] Find a way to make local download *really* easy.
- [ ] Improve reliability of static knowledge generation.
- [ ] adjust size of input field for knowledge in vertical format.
- [ ] Add more information to story details and clean up layout.
- [ ] Clean up UI for sequential Dynamic Knowledge.
- [ ] Add more UI color options for markdown.

