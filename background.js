console.log('Background script loaded - VERSION 4 (Backend)');

const BACKEND_URL = 'http://localhost:3000'; // Change to your deployed backend URL
const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyBcHEGgONk1Ff5a8Z1PLT6g3piFMZ9r_8A',
  projectId: 'customqa-cf40b'
};

// Get ID token and refresh if necessary
async function getIdToken() {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(['customqa_idToken', 'customqa_refreshToken', 'customqa_tokenExpiresAt', 'customqa_currentUser'], (items) => {
      if (chrome.runtime.lastError) {
        console.error('[BG] Chrome storage error:', chrome.runtime.lastError);
        reject(chrome.runtime.lastError);
        return;
      }

      let token = items.customqa_idToken || null;
      const refreshToken = items.customqa_refreshToken || null;
      const expiresAt = Number(items.customqa_tokenExpiresAt || 0);
      const user = items.customqa_currentUser;
      
      console.log('[BG] Token check:', {
        hasToken: !!token,
        hasRefreshToken: !!refreshToken,
        expiresAt: expiresAt,
        isExpired: expiresAt && Date.now() >= expiresAt,
        user: user?.email
      });
      
      // Check if token is expired and refresh if needed
      if (token && refreshToken && expiresAt && Date.now() >= expiresAt) {
        console.log('[BG] Token expired, attempting refresh...');
        refreshIdToken(refreshToken)
          .then((newToken) => {
            if (newToken) {
              token = newToken;
              console.log('[BG] Token refreshed successfully');
            } else {
              console.warn('[BG] Token refresh returned null');
            }
            resolve(token);
          })
          .catch((error) => {
            console.error('[BG] Token refresh failed, using old token:', error);
            resolve(token); // Fall back to old token
          });
      } else {
        if (!token) {
          console.warn('[BG] No valid token available');
        }
        resolve(token);
      }
    });
  });
}

// Refresh Firebase ID token
async function refreshIdToken(refreshToken) {
  try {
    console.log('[BG] Refreshing Firebase token...');
    const response = await fetch(
      `https://securetoken.googleapis.com/v1/token?key=${FIREBASE_CONFIG.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}`
      }
    );

    const data = await response.json();
    console.log('[BG] Firebase refresh response status:', response.status);
    
    if (!response.ok) {
      console.error('[BG] Firebase refresh failed:', data);
      throw new Error(data.error?.message || 'Token refresh failed');
    }
    
    if (!data.id_token) {
      console.error('[BG] No id_token in refresh response:', data);
      throw new Error('No id_token in response');
    }

    const newIdToken = data.id_token;
    const expiresInSeconds = parseInt(data.expires_in || '3600', 10);
    const newExpiresAt = Date.now() + Math.max(0, expiresInSeconds - 60) * 1000;
    
    // Update Chrome storage with new token
    chrome.storage.local.set({
      customqa_idToken: newIdToken,
      customqa_tokenExpiresAt: newExpiresAt
    });
    
    console.log('[BG] Token updated in storage, expires in', expiresInSeconds, 'seconds');
    return newIdToken;
  } catch (error) {
    console.error('[BG] Error refreshing token:', error);
    return null;
  }
}

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

// Main message listener
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('[BG] Received message:', request.type);

  const mapVoiceFromRequest = () => {
    if (request.voice && typeof request.voice === 'string') {
      return request.voice;
    }
    const gender = (request.gender || '').toLowerCase();
    if (gender === 'male') return 'echo';
    if (gender === 'androgynous') return 'alloy';
    return 'nova';
  };
  
  (async () => {
    try {
      const idToken = await getIdToken();
      if (!idToken) {
        sendResponse({ success: false, error: 'Not logged in' });
        return;
      }

      let result;
      
      if (request.type === 'CALL_GEMINI') {
        console.log('[BG] Processing CALL_GEMINI');
        result = await callBackend('/api/call-gemini', {
          text: request.prompt,
          frames: request.frameData ? [request.frameData] : [],
          options: request.options || {}
        }, idToken);
        sendResponse({ success: true, text: result.result });
        
      } else if (request.type === 'CALL_GEMINI_FOR_AD') {
        console.log('[BG] Processing CALL_GEMINI_FOR_AD');
        const resolvedVideoUrl = resolveVideoUrlForAdRequest(request, sender);
        const prompt = build_ad_prompt(
          request.customizations || {},
          resolvedVideoUrl,
          request.videoDuration,
          request.segments || []
        );

        result = await callBackend('/api/call-gemini', {
          text: prompt,
          frames: request.segments || [],
          options: {
            videoUrl: resolvedVideoUrl,
            videoDuration: request.videoDuration,
            segments: request.segments,
            taskType: 'ad'
          }
        }, idToken);
        sendResponse({ success: true, text: result.result });
        
      } else if (request.type === 'CALL_GEMINI_VQA') {
        console.log('[BG] Processing CALL_GEMINI_VQA');
        const resolvedVideoUrl = resolveVideoUrlForAdRequest(request, sender);
        result = await callBackend('/api/call-gemini', {
          text: request.prompt,
          frames: request.frameData ? [request.frameData] : [],
          options: {
            videoUrl: resolvedVideoUrl,
            timestamp: request.timestamp,
            taskType: 'vqa'
          }
        }, idToken);
        sendResponse({ success: true, text: result.result });
        
      } else if (request.type === 'CALL_GEMINI_VQA_MULTIFRAME') {
        console.log('[BG] Processing CALL_GEMINI_VQA_MULTIFRAME');
        result = await callBackend('/api/call-gemini', {
          text: request.prompt,
          frames: request.frames || [],
          options: { videoUrl: request.videoUrl }
        }, idToken);
        sendResponse({ success: true, text: result.result });
        
      } else if (request.type === 'CALL_WHISPER') {
        console.log('[BG] Processing CALL_WHISPER');
        result = await callBackend('/api/call-whisper', {
          audioBlob: request.audioBlob,
          settings: request.settings || {}
        }, idToken);
        sendResponse({ success: true, text: result.text });
        
      } else if (request.type === 'CALL_TTS') {
        console.log('[BG] Processing CALL_TTS');
        result = await callBackend('/api/call-tts', {
          text: request.text,
          voice: mapVoiceFromRequest(),
          speed: request.speed
        }, idToken);
        sendResponse({ success: true, audioUrl: result.audioUrl });

      } else if (request.type === 'CALL_OPENAI_TTS') {
        console.log('[BG] Processing CALL_OPENAI_TTS');
        result = await callBackend('/api/call-tts', {
          text: request.text,
          voice: mapVoiceFromRequest(),
          speed: request.speed
        }, idToken);
        sendResponse({ success: true, audioDataUrl: result.audioUrl });

      } else if (request.type === 'PRELOAD_OPENAI_TTS') {
        console.log('[BG] Processing PRELOAD_OPENAI_TTS');
        result = await callBackend('/api/call-tts', {
          text: request.text,
          voice: mapVoiceFromRequest(),
          speed: request.speed
        }, idToken);
        sendResponse({ success: true, text: request.text, audioDataUrl: result.audioUrl });

      } else if (request.type === 'OPEN_POPUP') {
        chrome.action.openPopup();
        sendResponse({ success: true });

      } else {
        sendResponse({ success: false, error: `Unsupported message type: ${request.type}` });
      }
    } catch (error) {
      console.error('[BG] Error:', error);
      sendResponse({ success: false, error: error.message });
    }
  })();
  
  return true; // Keep message channel open for async response
});

// Call backend API
async function callBackend(endpoint, body, idToken) {
  console.log('[Backend] Calling', endpoint, 'with token:', idToken ? `${idToken.substring(0, 20)}...` : 'NONE');
  
  if (!idToken) {
    throw new Error('No authentication token available');
  }
  
  const response = await fetch(`${BACKEND_URL}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${idToken}`
    },
    body: JSON.stringify(body)
  });

  console.log('[Backend] Response status:', response.status);

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[Backend] Error ${response.status}:`, errorText);
    let backendMessage = errorText;
    try {
      const parsed = JSON.parse(errorText);
      backendMessage = parsed?.error || parsed?.message || errorText;
    } catch {
      // Keep raw text when backend didn't return JSON.
    }
    throw new Error(`Backend error: ${response.status} - ${backendMessage}`);
  }

  const data = await response.json();
  if (!data.success && data.error) {
    throw new Error(data.error);
  }

  return data;
}

// ==================== HELPER FUNCTIONS ====================

// Build AD prompt with detailed guidelines - RESTORED VERSION
function build_ad_prompt(customizations, videoUrl, videoDuration, segments) {
  const segmentTimeline = Array.isArray(segments) ? segments : [];
  const targetWords = Number.isFinite(Number(customizations?.adLength || customizations?.length)) 
    ? Number(customizations.adLength || customizations.length) 
    : 25;
  const maxWords = targetWords + 5;
  const minWords = Math.max(5, targetWords - 5);
  const frequencyToHumanText = {
    'rarely': 'Every 60 seconds',
    'sometimes': 'Every 30 seconds',
    'often': 'Every 15 seconds',
    'very-often': 'Every 8 seconds'
  };

  let base_prompt = `
You are an AI designed to assist in creating high-quality and contextually rich descriptions for videos, aimed at enhancing accessibility for blind and low-vision (BLV) users.
The input consists of a video URL and predefined time sections. Craft audio descriptions that are highly personalised, based on guidance from the BLV.
You must follow all the given instructions. You should avoid any prefatory language, such as "the video shows". Follow the General and Customised guidelines shared by the user. You should prioritise the customised guidelines while adhering to the general Guidelines:
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
  - Description Length: Target approximately ${targetWords} words per description segment.
  - Hard Length Bounds: Each description MUST be between ${minWords} and ${maxWords} words.
  - Frequency: ${frequencyToHumanText[customizations.adFrequency] || frequencyToHumanText[customizations.frequency] || 'Every 30 seconds'} (${customizations.intervalSeconds || 30} second section size).
  - Scene Changes: When scenes change within a segment, include explicit timestamps in the sentence (e.g., "At 1:05, ...").
  - Silent Sections: If there is little/no visible change in part of a segment, explicitly mention that quiet/silent interval and its timestamp range.
  - Emphasis: ${emphasis_guidelines[customizations.adEmphasis || customizations.emphasis] || emphasis_guidelines['balanced']}
  - Style: ${subjectiveness_guidelines[customizations.adNarrationStyle || customizations.subjectiveness] || subjectiveness_guidelines['objective']}

  VIDEO CONTEXT:
  - Video URL: ${videoUrl || 'unknown'}
  - Video duration (seconds): ${typeof videoDuration === 'number' ? videoDuration : 'unknown'}

${guidelines}

TASK INSTRUCTIONS:
  You are provided with a video URL and a list of fixed time segments. Your task is to generate comprehensive audio descriptions for each segment.
  For each segment, describe the ENTIRE interval from segment start to segment end, not isolated moments.
  Make sure each description reflects progression through the section (beginning -> middle -> end), including scene transitions and any notable quiet/no-change spans.

CUSTOMIZATION PRIORITY RULE:
  User customizations are mandatory and override default stylistic tendencies. Do not ignore length, style, emphasis, or color settings.

HARD OUTPUT RULES:
  1. Output valid JSON only (no markdown, no prose outside JSON).
  2. Every description MUST be between ${minWords} and ${maxWords} words.
  3. Keep each segment concise. If many events occur, summarize and include only the most important scene changes.
  4. Include timestamped scene-change cues and mention silent/no-change spans when present.

IMPORTANT: Your response must be valid JSON as an array of objects with this structure:
[
  {
    "timestamp_start": <number>,
    "timestamp_end": <number>,
    "timestamp_in_seconds": <number>,
    "description": "<audio description text>"
  }
]

For each segment:
- timestamp_start MUST equal the segment start.
- timestamp_end MUST equal the segment end.
- timestamp_in_seconds MUST equal timestamp_start.

SEGMENTS TO DESCRIBE (start/end timestamps in seconds):
${segmentTimeline.length > 0 ? segmentTimeline.map((seg, i) => {
  const start = typeof seg === 'number' ? seg : (seg.timestamp_in_seconds || seg.start_in_seconds || 0);
  const end = typeof seg === 'number' ? seg : (seg.end_in_seconds || start);
  return `${i + 1}. Start: ${start}s, End: ${end}s`;
}).join('\n') : '- No segments provided'}

Begin analyzing the video now and return only valid JSON:
`;

  return base_prompt;
}

// Video URL resolution helper
function resolveVideoUrlForAdRequest(request, sender) {
  if (request.videoUrl) return request.videoUrl;
  if (sender?.tab?.url) {
    try {
      const url = new URL(sender.tab.url);
      const videoId = url.searchParams.get('v');
      if (videoId) return `https://www.youtube.com/watch?v=${videoId}`;
    } catch (error) {
      console.warn('Could not extract video ID:', error);
    }
  }
  return request.videoUrl || '';
}
