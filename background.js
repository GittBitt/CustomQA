console.log('Background script loaded - VERSION 3');

chrome.runtime.onInstalled.addListener(() => {
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach((tab) => {
      chrome.tabs.reload(tab.id);
    });
  });
});

chrome.tabs.onUpdated.addListener((tabId, tab) => {
    if (tab.url && tab.url.includes("youtube.com/watch")) {
      const queryParameters = tab.url.split("?")[1];
      const urlParameters = new URLSearchParams(queryParameters);
  
      chrome.tabs.sendMessage(tabId, {
        type: "NEW",
        videoId: urlParameters.get("v"),
      });
    }
  });

// Handle Gemini API calls from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('[BG] Received message:', request.type);
  
  if (request.type === 'CALL_GEMINI') {
    console.log('[BG] Processing CALL_GEMINI');
    
    // Use async IIFE to handle async operation
    (async () => {
      try {
        const result = await callGeminiAPI(request.prompt, request.frameData);
        console.log('[BG] Sending success response');
        sendResponse({ success: true, text: result });
      } catch (error) {
        console.error('[BG] Error:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    
    return true; // Keep the message channel open for async response
  } else if (request.type === 'CALL_GEMINI_FOR_AD') {
    console.log('[BG] Processing CALL_GEMINI_FOR_AD');
    console.log('[BG] Frames received:', request.frames?.length);
    
    (async () => {
      try {
        const prompt = build_ad_prompt(request.customizations);
        // Pass frames with their timestamps to Gemini
        const framesForGemini = request.frames && Array.isArray(request.frames) 
          ? request.frames.map(f => ({
              frameData: f.frameData,
              timestamp: f.timestamp
            }))
          : [];
        
        console.log('[BG] Calling Gemini with', framesForGemini.length, 'frames');
        const result = await callGeminiAPI(prompt, framesForGemini);
        console.log('[BG] Sending success response', result?.substring?.(0, 100));
        sendResponse({ success: true, text: result });
      } catch (error) {
        console.error('[BG] Error:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    
    return true;
  } else if (request.type === 'CALL_GEMINI_VQA_MULTIFRAME') {
    console.log('[BG] Processing CALL_GEMINI_VQA_MULTIFRAME');
    console.log('[BG] Frames received:', request.frames?.length);
    
    (async () => {
      try {
        const framesForGemini = request.frames && Array.isArray(request.frames) 
          ? request.frames.map(f => ({
              frameData: f.frameData,
              timestamp: f.timestamp
            }))
          : [];
        
        console.log('[BG] Calling Gemini with', framesForGemini.length, 'frames');
        const result = await callGeminiAPI(request.prompt, framesForGemini);
        console.log('[BG] Sending success response', result?.substring?.(0, 100));
        sendResponse({ success: true, text: result });
      } catch (error) {
        console.error('[BG] Error:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    
    return true;
  } else if (request.type === 'CALL_OPENAI_TTS' || request.type === 'PRELOAD_OPENAI_TTS') {
    console.log(`[BG] Processing ${request.type}`);
    
    (async () => {
      try {
        const audioDataUrl = await getOpenAI_TTS_API(request.text, request.gender);
        sendResponse({ success: true, audioDataUrl: audioDataUrl, text: request.text });
      } catch (error) {
        console.error('[BG] Error:', error);
        sendResponse({ success: false, error: error.message, text: request.text });
      }
    })();
    
    return true;
  } else if (request.type === 'OPEN_POPUP') {
    chrome.action.openPopup();
    return true;
  } else if (request.type === 'AUTH_SIGNUP') {
    handleAuthSignup(request, sendResponse);
    return true;
  } else if (request.type === 'AUTH_LOGIN') {
    handleAuthLogin(request, sendResponse);
    return true;
  } else if (request.type === 'AUTH_LOGOUT') {
    handleAuthLogout(sendResponse);
    return true;
  } else if (request.type === 'AUTH_CHECK') {
    handleAuthCheck(sendResponse);
    return true;
  }
});

async function getOpenAI_TTS_API(text, gender) {
  let apiKey = '';
  try {
    console.log('[OpenAI TTS] Fetching API key...');
    const envResponse = await fetch(chrome.runtime.getURL('.env'));
    
    if (!envResponse.ok) {
      throw new Error(`Failed to fetch .env: ${envResponse.statusText}`);
    }
    
    const envText = await envResponse.text();
    const lines = envText.split('\n');
    const apiKeyLine = lines.find(line => line.trim().startsWith('OPENAI_API_KEY='));
    
    if (!apiKeyLine) {
      throw new Error('OPENAI_API_KEY not found in .env');
    }
    
    apiKey = apiKeyLine.trim().split('OPENAI_API_KEY=')[1].trim();
    
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is empty');
    }
    
    console.log(`[OpenAI TTS] Using API Key: ...${apiKey.slice(-4)}`);
    
    let voice = 'alloy'; // default voice, often perceived as neutral/androgynous
    if (gender === 'female') {
        voice = 'nova';
    } else if (gender === 'male') {
        voice = 'echo';
    } else if (gender === 'androgynous') {
        voice = 'alloy'; // Explicitly use alloy for androgynous
    }

    console.log(`[OpenAI TTS] Calling API with text: "${text.substring(0, 50)}..." and voice: "${voice}"`);
    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'tts-1',
        input: text,
        voice: voice,
      }),
    });

    console.log('[OpenAI TTS] API response status:', response.status);

    if (!response.ok) {
      const errorData = await response.json();
      console.error('[OpenAI TTS] API error:', errorData);
      throw new Error(`OpenAI API error: ${errorData.error.message}`);
    }

    const audioBlob = await response.blob();
    console.log('[OpenAI TTS] Received audio blob, size:', audioBlob.size);
    const reader = new FileReader();
    return new Promise((resolve, reject) => {
      reader.onloadend = () => {
        console.log('[OpenAI TTS] Successfully created data URL.');
        resolve(reader.result);
      };
      reader.onerror = (error) => {
        console.error('[OpenAI TTS] FileReader error:', error);
        reject(error);
      };
      reader.readAsDataURL(audioBlob);
    });
  } catch (error) {
    console.error("[OpenAI TTS] Error calling OpenAI TTS API:", error.message);
    throw new Error(`[OpenAI TTS] Error: ${error.message}`);
  }
}

function build_ad_prompt(customizations) {
    let base_prompt = `
    You are an AI designed to assist in creating high-quality and contextually rich descriptions for videos, aimed at enhancing accessibility for blind and low-vision (BLV) users.
    The input consists of a series of video frames, each with a timestamp. Based on these frames, craft audio descriptions that are highly personalised, based on guidance from the BLV.
    You must follow all the given instructions. You should avoid any prefatory language, such as \`the video shows\`. Follow the General and Customised guidelines shared by the user. You should prioritise the customised guidelines while adhering to the general Guidelines:
`;

    const guidelines = `
GENERAL AUDIO DESCRIPTION GUIDELINES:

1. Avoid over-describing - Do not include non-essential visual details.
2. Description should not be opinionated unless content demands it.
3. Choose a level of detail based on plot relevance when describing scenes.
4. Description should be informative and conversational, in present tense and third-person omniscient.
5. The vocabulary should reflect the predominant language/accent of the program and should be consistent with the genre and tone of the content while also mindful of the target audience. Vocabulary used should ensure accuracy, clarity, and conciseness.
6. Consider historical context and avoid words with negative connotations or bias.
7. Pay attention to verbs - Choose vivid verbs over bland ones with adverbs.
8. Use pronouns only when clear whom they refer to.
9. Use comparisons for shapes and sizes with familiar and globally relevant objects.
10. Maintain consistency in word choice, character qualities, and visual elements for all audio descriptions.
11. Tone and vocabulary should match the target audience's age range.
12. Ensure no errors in word selection, pronunciation, diction, or enunciation.
13. Start with general context, then add details.
14. Describe shape, size, texture, or color as appropriate to the content.
15. Use first-person narrative for engagement if required to engage the audience.
16. Use articles appropriately to introduce or refer to subjects.
17. Prefer formal speech over colloquialisms, except where appropriate.
18. When introducing new terms, objects, or actions, label them first, and then follow with the definitions.
19. Describe objectively without personal interpretation or comment. Also, do not censor content.
20. Deliver narration steadily and impersonally (but not monotonously), matching the program's tone.
21. It can be important to add emotion, excitement, and lightness of touch at different points. Adjust style for emotion and mood according to the program's genre.
22. If it is children's content, tailor language and pace for children's TV, considering audience feedback.
23. Do not alter, filter, or exclude content. You should describe what you see. Try to seek simplicity and succinctness in your description.
24. Prioritize what is relevant when describing action as to not affect user experience.
25. Include location, time, and weather conditions when relevant to the scene or plot.
26. Focus on key content for learning and enjoyment when creating audio descriptions. This is so that the intention of the program is conveyed.
27. When describing an instructional video/content, describe the sequence of activities first.
28. For a dramatic production, include elements such as style, setting, focus, period, dress, facial features, objects, and aesthetics.
29. Describe what is most essential for the viewer to know in order to follow, understand, and appreciate the intended learning outcomes of the video/content.
30. Audio description should describe characters, locations, time and circumstances, on-screen action, and on-screen information.
31. Describe only what a sighted viewer can see.
32. Describe main and key supporting characters' visual aspects relevant to identity and personality. Prioritize factual descriptions of traits like hair, skin, eyes, build, height, age, and visible disabilities. Ensure consistency and avoid singling out characters for specific traits. Use person-first language.
33. If unable to confirm or if not established in the plot, do not guess or assume racial, ethnic or gender identity.
34. When naming characters for the first time, aim to include a descriptor before the name (e.g., a bearded man, Jack).
35. Description should convey facial expressions, body language and reactions.
36. When important to the meaning/intent of content, describe race using currently-accepted terminology.
37. Avoid identifying characters solely by gender expression unless it offers unique insights not apparent otherwise to visually impaired viewers.
38. Describe character clothing if it enhances characterization, plot, setting, or genre enjoyment.
39. If text on the screen is central to understanding, establish a pattern of on-screen words being read. This may include making an announcement, such as 'Words appear'.
40. In the case of subtitles, the describer should read the translation after stating that a subtitle appears.
41. When shot changes are critical to the understanding of the scene, indicate them by describing where the action is or where characters are present in the new shot.
42. Provide description before the content rather than after.
`;

    const emphasis_guidelines = {
        'character': 'Prioritize character-related details such as appearance, expressions, gestures, actions, and interactions. Focus on what people are doing and how they are doing it.',
        'environment': 'Prioritize spatial descriptions, atmosphere, setting, background elements, layout, lighting, and environmental textures. Focus on where the action takes place and the mood of the setting.',
        'balanced': 'Provide balanced descriptions following the general AD guidelines. Give equal attention to all visual elements.',
        'instructional': 'Prioritize the main plot or instructional content. Focus on plot progression, cause-effect relationships, and key narrative developments. Ensure descriptions and transitions between scenes are strongly tied to story or instructional continuity. Secondary visual details should be included only when they enhance plot understanding.'
    };

    const subjectiveness_guidelines = {
        'objective': 'Maintain strict factual neutrality. Describe only observable visual elements without interpretation or emotional inference unless clearly visible. Avoid assumptions about motivations, intentions, or unstated emotional states. Use neutral, descriptive language.',
        'subjective': 'Use interpretive language to convey atmosphere, emotional mood, and inferred character feelings when they reasonably align with visual cues. Use expressive vocabulary to enhance immersion for the BLV user. Include mood, tone, and emotional context.'
    };

    base_prompt += `
CUSTOM GUIDELINES SPECIFIED BY USER:
- Description Length: Target approximately ${customizations.length} words per description segment. This is a soft limit; you can go 5 words over or under if it improves the description.
- Scene Change Timestamps: If you detect a significant scene change within a segment, mention the timestamp of the change in the description (e.g., "At 1:05, the scene changes to..."). Only include this if it fits naturally within the word count.
- Emphasis: ${emphasis_guidelines[customizations.emphasis] || emphasis_guidelines['balanced']}
- Style: ${subjectiveness_guidelines[customizations.subjectiveness] || subjectiveness_guidelines['objective']}
`;

    if (customizations.colorPreference === 'off') {
        base_prompt += `- Color Descriptions: IMPORTANT - Omit ALL color information from descriptions. Do not mention colors of objects, clothing, environments, or any visual elements.
`;
    }

    base_prompt += `
${guidelines}

TASK INSTRUCTIONS:
You are provided with a series of video frames, each with a timestamp. Your task is to generate an audio description for each time segment between frames.
When generating a description for a segment (e.g., from timestamp A to timestamp B), you must analyze *all* the frames provided to understand the full context of the scene. The description for that segment should summarize the key visual events that happen between timestamp A and B, not just what is visible at timestamp A.
1. For each frame and its timestamp, create an audio description for the time period starting at that timestamp and ending at the next one.
2. This description must summarize the actions and changes occurring during this interval, using all provided frames for context.
3. Adhere to the user's customization settings.
4. Ensure descriptions are presented in the order of the frames.
5. Return descriptions as valid JSON matching the VideoMetadata schema.

IMPORTANT: Your response must be valid JSON matching the VideoMetadata schema with the structure:
{
  "VideoMetadata": {
    "audio_descriptions": [
      {
        "timestamp_in_seconds": <number>,
        "description": "<audio description text for the time range starting at this timestamp>"
      }
    ]
  }
}

Begin analyzing the frames now:
`;

    return base_prompt;
}

async function callGeminiAPI(prompt, frames) {
  let apiKey = '';
  try {
    console.log('[Gemini API] Fetching API key...');
    const envResponse = await fetch(chrome.runtime.getURL('.env'));
    
    if (!envResponse.ok) {
      throw new Error(`Failed to fetch .env: ${envResponse.statusText}`);
    }
    
    const envText = await envResponse.text();
    console.log('[Gemini API] Raw .env content length:', envText.length);
    const lines = envText.split('\n');
    const apiKeyLine = lines.find(line => line.trim().startsWith('API_KEY='));
    
    if (!apiKeyLine) {
      throw new Error('API_KEY not found in .env');
    }
    
    apiKey = apiKeyLine.trim().split('API_KEY=')[1].trim();
    
    if (!apiKey) {
      throw new Error('API_KEY is empty');
    }
    
    console.log(`[Gemini API] Using API Key: ...${apiKey.slice(-4)}`);
    const model = "gemini-2.5-flash"; // Fast model
    
    console.log('[Gemini API] Using model:', model);
    console.log('[Gemini API] Frame data present:', !!frames);
    console.log('[Gemini API] Number of frames:', frames?.length || 0);
    
    // Build content parts
    const parts = [];
    
    // Add images if provided
    if (frames && Array.isArray(frames)) {
        console.log('[Gemini API] Processing', frames.length, 'frames for AD');
        frames.forEach((frame, index) => {
            parts.push({
                inlineData: {
                    mimeType: "image/jpeg",
                    data: frame.frameData
                }
            });
            parts.push({
                text: `Frame ${index + 1} - Timestamp: ${frame.timestamp}s`
            });
        });
    } else if (frames && typeof frames === 'string') {
        // Single frame data for VQA
        console.log('[Gemini API] Processing single frame for VQA');
        parts.push({
            inlineData: {
                mimeType: "image/jpeg",
                data: frames
            }
        });
    }
    
    // Add text prompt
    parts.push({
      text: prompt
    });
    
    console.log('[Gemini API] Sending request with', parts.length, 'parts');
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: parts
        }]
      })
    });

    console.log('[Gemini API] Response status:', response.status);
    
    // Get the response text first
    const responseText = await response.text();
    console.log('[Gemini API] Raw response length:', responseText.length);
    if (responseText.length > 500) {
      console.log('[Gemini API] Raw response start:', responseText.substring(0, 500));
    } else {
      console.log('[Gemini API] Raw response:', responseText);
    }

    if (!response.ok) {
      console.error('[Gemini API] Bad response status');
      try {
        const errorData = JSON.parse(responseText);
        const errorMsg = errorData.error?.message || response.statusText;
        console.error('[Gemini API] Parsed error:', errorMsg);
        throw new Error(`API error: ${response.status} - ${errorMsg}`);
      } catch (e) {
        console.error('[Gemini API] Could not parse error response');
        throw new Error(`API error: ${response.status} - ${responseText}`);
      }
    }

    try {
      const data = JSON.parse(responseText);
      console.log('[Gemini API] Success! Response received');
      console.log('[Gemini API] Response keys:', Object.keys(data).join(', '));
      
      if (data.candidates && data.candidates[0] && data.candidates[0].content) {
        const text = data.candidates[0].content.parts[0].text;
        console.log('[Gemini API] Extracted text length:', text.length);
        return text;
      } else if (data.error) {
        throw new Error(`API returned error: ${data.error.message}`);
      } else {
        console.error('[Gemini API] Unexpected response format:', data);
        throw new Error('Unexpected API response format');
      }
    } catch (parseError) {
      console.error('[Gemini API] JSON parse error:', parseError.message);
      throw new Error(`Failed to parse API response: ${parseError.message}`);
    }
  } catch (error) {
    console.error("[Gemini API] Error calling Gemini API:", error.message);
    throw new Error(`[Gemini API] Error: ${error.message}`);
  }
}

// Firebase Auth Handlers - these need to be handled in content script context
// since Firebase SDK requires DOM access in extension context

function handleAuthSignup(request, sendResponse) {
  console.log('[BG] Auth signup request:', request.email);
  // Send to content script which has Firebase context
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      chrome.tabs.sendMessage(
        tabs[0].id,
        { type: 'FIREBASE_SIGNUP', email: request.email, password: request.password, role: request.role },
        (response) => {
          sendResponse(response);
        }
      );
    }
  });
}

function handleAuthLogin(request, sendResponse) {
  console.log('[BG] Auth login request:', request.email);
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      chrome.tabs.sendMessage(
        tabs[0].id,
        { type: 'FIREBASE_LOGIN', email: request.email, password: request.password },
        (response) => {
          sendResponse(response);
        }
      );
    }
  });
}

function handleAuthLogout(sendResponse) {
  console.log('[BG] Auth logout request');
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      chrome.tabs.sendMessage(
        tabs[0].id,
        { type: 'FIREBASE_LOGOUT' },
        (response) => {
          sendResponse(response);
        }
      );
    }
  });
}

function handleAuthCheck(sendResponse) {
  console.log('[BG] Auth check request');
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      chrome.tabs.sendMessage(
        tabs[0].id,
        { type: 'FIREBASE_CHECK' },
        (response) => {
          sendResponse(response || { user: null });
        }
      );
    }
  });
}
  