console.log('Background script loaded - VERSION 2');

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
  } else if (request.type === 'CALL_OPENAI_TTS') {
    console.log('[BG] Processing CALL_OPENAI_TTS');
    
    (async () => {
      try {
        const audioDataUrl = await callOpenAI_TTS_API(request.text, request.gender);
        sendResponse({ success: true, audioDataUrl: audioDataUrl });
      } catch (error) {
        console.error('[BG] Error:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    
    return true;
  }
});

async function callOpenAI_TTS_API(text, gender) {
  let apiKey = '';
  try {
    console.log('[OpenAI TTS] Fetching API key...');
    const envResponse = await fetch(chrome.runtime.getURL('.env'));
    const envText = await envResponse.text();
    const lines = envText.split('\n');
    const apiKeyLine = lines.find(line => line.trim().startsWith('OPENAI_API_KEY='));
    apiKey = apiKeyLine ? apiKeyLine.trim().split('OPENAI_API_KEY=')[1].trim() : '';
    console.log(`[OpenAI TTS] Using API Key: ...${apiKey.slice(-4)}`);
    
    let voice = 'alloy'; // default
    if (gender === 'female') {
        voice = 'nova';
    } else if (gender === 'male') {
        voice = 'echo';
    }

    console.log(`[OpenAI TTS] Calling API with text: "${text}" and voice: "${voice}"`);
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
    console.error("[API] Error calling OpenAI TTS API:", error.message);
    throw new Error(`[API] Error calling OpenAI TTS API: ${error.message}.`);
  }
}

async function callGeminiAPI(prompt, frameData) {
  let apiKey = '';
  try {
    console.log('[API] 1');
    const envResponse = await fetch(chrome.runtime.getURL('.env'));
    console.log('[API] 2');
    const envText = await envResponse.text();
    console.log('[Gemini API] Raw .env content:', envText); // Log raw content for debugging
    const lines = envText.split('\n');
    const apiKeyLine = lines.find(line => line.trim().startsWith('API_KEY='));
    const apiKey = apiKeyLine ? apiKeyLine.trim().split('API_KEY=')[1].trim() : '';
    console.log(`[Gemini API] Using API Key: ...${apiKey.slice(-4)}`);
    const model = "gemini-2.5-flash"; // Use current 2.5 Flash model
    
    console.log('[API] API Key loaded, making request to Gemini');
    console.log('[API] Using model:', model);
    console.log('[API] Frame data present:', !!frameData);
    
    // Build content parts
    const parts = [];
    
    // Add image if provided
    if (frameData) {
      console.log('[API] Adding image to request');
      parts.push({
        inlineData: {
          mimeType: "image/jpeg",
          data: frameData
        }
      });
    }
    
    // Add text prompt
    parts.push({
      text: prompt
    });
    
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

    console.log('[API] Response status:', response.status);
    
    // Get the response text first
    const responseText = await response.text();
    console.log('[API] Raw response:', responseText.substring(0, 500));

    if (!response.ok) {
      console.error('[API] Bad response status');
      try {
        const errorData = JSON.parse(responseText);
        const errorMsg = errorData.error?.message || response.statusText;
        console.error('[API] Parsed error:', errorMsg);
        throw new Error(`API error: ${response.status} - ${errorMsg}`);
      } catch (e) {
        console.error('[API] Could not parse error response');
        throw new Error(`API error: ${response.status} - ${responseText}`);
      }
    }

    try {
      const data = JSON.parse(responseText);
      console.log('[API] Success! Response received');
      console.log('[API] Response keys:', Object.keys(data).join(', '));
      
      if (data.candidates && data.candidates[0] && data.candidates[0].content) {
        const text = data.candidates[0].content.parts[0].text;
        console.log('[API] Extracted text length:', text.length);
        return text;
      } else if (data.error) {
        throw new Error(`API returned error: ${data.error.message}`);
      } else {
        console.error('[API] Unexpected response format:', data);
        throw new Error('Unexpected API response format');
      }
    } catch (parseError) {
      console.error('[API] JSON parse error:', parseError.message);
      throw new Error(`Failed to parse API response: ${parseError.message}`);
    }
  } catch (error) {
    console.error("[API] Error calling Gemini API:", error.message);
    throw new Error(`[API] Error calling Gemini API: ${error.message}. API Key used: ${apiKey}`);
  }
}
  