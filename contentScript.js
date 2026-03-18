(() => {
    let currentVolume = 1; // Default volume

    // Load initial volume from storage
    chrome.storage.sync.get('volume', (data) => {
        if (data.volume) {
            currentVolume = parseFloat(data.volume) / 100;
        }
    });

    // Listen for volume changes in storage
    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (changes.volume) {
            currentVolume = parseFloat(changes.volume.newValue) / 100;
        }
    });

    const newVideoLoaded = async () => {
        if (!window.location.href.includes('watch?v=')) {
            return false;
        }

        let currentAudio = null;
        let currentPlayingButton = null;

        const playAudioFromDataUrl = (dataUrl, buttonElement) => {
            if (currentAudio) {
                currentAudio.pause();
                currentAudio = null;
                if (currentPlayingButton) {
                    currentPlayingButton.textContent = '🔊';
                    currentPlayingButton = null;
                }
            }

            console.log('playAudioFromDataUrl called with dataUrl:', dataUrl.substring(0, 50) + '...');
            const audio = new Audio(dataUrl);
            audio.volume = currentVolume;
            
            const vqaSpeedSlider = document.getElementById('vqa-speed-slider');
            if (vqaSpeedSlider) {
                audio.playbackRate = parseFloat(vqaSpeedSlider.value) / 50;
                console.log('Current playback speed:', audio.playbackRate);
            } else {
                console.log('VQA Speed Slider not found, defaulting to 1x speed.');
                audio.playbackRate = 1;
            }
            
            console.log('Current volume:', currentVolume);

            audio.addEventListener('canplaythrough', () => {
                console.log('Audio can play through.');
                console.log('Calling audio.play()');
                audio.play().then(() => {
                    if (buttonElement) {
                        buttonElement.textContent = '⏸️';
                    }
                }).catch(error => {
                    console.error('Audio playback failed:', error);
                    if (buttonElement) {
                        buttonElement.textContent = '🔊';
                    }
                });
            });

            audio.addEventListener('error', (e) => {
                console.error('Audio element error:', e);
                currentAudio = null;
                currentPlayingButton = null;
                if (buttonElement) {
                    buttonElement.textContent = '🔊';
                }
            });

            audio.addEventListener('ended', () => {
                console.log('Audio playback ended.');
                currentAudio = null;
                currentPlayingButton = null;
                if (buttonElement) {
                    buttonElement.textContent = '🔊';
                }
            });

            currentAudio = audio;
            currentPlayingButton = buttonElement;
            return audio;
        };

        const sidebarExists = document.getElementById("custom-qa-sidebar");

        if (!sidebarExists) {
            const secondary = document.getElementById("secondary");
            if (secondary) {
                const sidebar = document.createElement("div");
                sidebar.id = "custom-qa-sidebar";
                sidebar.style.width = "100%";
                sidebar.style.height = "auto";
                sidebar.style.backgroundColor = "#f2f2f2";
                sidebar.style.borderRadius = "8px";
                sidebar.style.padding = "16px";
                sidebar.style.marginBottom = "16px";

                // Fetch and inject HTML and CSS
                const htmlUrl = chrome.runtime.getURL('sidebar.html');
                const cssUrl = chrome.runtime.getURL('sidebar.css');

                if (!htmlUrl || !cssUrl) {
                    console.error('Could not find sidebar.html or sidebar.css');
                    return;
                }

                console.log('htmlUrl:', htmlUrl);
                console.log('cssUrl:', cssUrl);

                const htmlResponse = await fetch(htmlUrl);
                console.log('html response:', htmlResponse);
                const html = await htmlResponse.text();

                const cssResponse = await fetch(cssUrl);
                console.log('css response:', cssResponse);
                const css = await cssResponse.text();

                const styleElement = document.createElement('style');
                styleElement.textContent = css;
                document.head.appendChild(styleElement);

                // No SDK script needed - we'll use the REST API directly

                sidebar.innerHTML = html;

                // Load and set volume for both sliders
                const adVolumeSlider = sidebar.querySelector('#ad-volume-slider');
                const vqaVolumeSlider = sidebar.querySelector('#vqa-volume-slider');

                const setSliderValues = (volume) => {
                    if (adVolumeSlider) adVolumeSlider.value = volume;
                    if (vqaVolumeSlider) vqaVolumeSlider.value = volume;
                };

                chrome.storage.sync.get('volume', (data) => {
                    if (data.volume) {
                        setSliderValues(data.volume);
                    }
                });

                const volumeChangeHandler = (e) => {
                    const newVolume = e.target.value;
                    chrome.storage.sync.set({ volume: newVolume });
                    setSliderValues(newVolume); // Keep sliders in sync
                };

                if (adVolumeSlider) {
                    adVolumeSlider.addEventListener('input', volumeChangeHandler);
                }
                if (vqaVolumeSlider) {
                    vqaVolumeSlider.addEventListener('input', volumeChangeHandler);
                }

                // Tab switching functionality
                const tabButtons = sidebar.querySelectorAll('.tab-button');
                const tabContents = sidebar.querySelectorAll('.tab-content');

                const adTab = sidebar.querySelector('#audio-descriptions-tab');
                const vqaTab = sidebar.querySelector('#vqa-tab');

                const syncPresentationSettings = (sourceTab, destTab) => {
                    if (!sourceTab || !destTab) return;

                    const sourceSpeed = sourceTab.querySelector('.slider[id*="speed-slider"]');
                    const sourceVolume = sourceTab.querySelector('.slider[id*="volume-slider"]');
                    const sourceVoice = sourceTab.querySelector('.pill-button[data-voice].active');
                    const sourceGender = sourceTab.querySelector('.pill-button[data-gender].active');

                    const destSpeed = destTab.querySelector('.slider[id*="speed-slider"]');
                    const destVolume = destTab.querySelector('.slider[id*="volume-slider"]');
                    const destVoiceButtons = destTab.querySelectorAll('.pill-button[data-voice]');
                    const destGenderButtons = destTab.querySelectorAll('.pill-button[data-gender]');

                    if (sourceSpeed && destSpeed) destSpeed.value = sourceSpeed.value;
                    if (sourceVolume && destVolume) destVolume.value = sourceVolume.value;

                    if (sourceVoice) {
                        destVoiceButtons.forEach(btn => {
                            btn.classList.toggle('active', btn.dataset.voice === sourceVoice.dataset.voice);
                        });
                    }

                    if (sourceGender) {
                        destGenderButtons.forEach(btn => {
                            btn.classList.toggle('active', btn.dataset.gender === sourceGender.dataset.gender);
                        });
                    }
                };

                tabButtons.forEach(button => {
                    button.addEventListener('click', () => {
                        const tabName = button.getAttribute('data-tab');
                        const currentActiveTab = sidebar.querySelector('.tab-content:not([style*="display: none"])');

                        // Update active tab button
                        tabButtons.forEach(btn => btn.classList.remove('active'));
                        button.classList.add('active');

                        // Show corresponding content
                        tabContents.forEach(content => {
                            content.style.display = 'none';
                        });
                        const newActiveTab = sidebar.querySelector(`#${tabName}-tab`);
                        newActiveTab.style.display = 'block';

                        // Sync settings
                        if (currentActiveTab && newActiveTab) {
                            syncPresentationSettings(currentActiveTab, newActiveTab);
                        }
                    });
                });

                // Length slider update
                const lengthSlider = sidebar.querySelector('#length-slider');
                const lengthValue = sidebar.querySelector('#length-value');
                const vqaLengthSlider = sidebar.querySelector('#vqa-length-slider');
                const vqaLengthValue = sidebar.querySelector('#vqa-length-value');

                const syncLengthSliders = (sourceSlider) => {
                    const newValue = sourceSlider.value;
                    if (lengthSlider && lengthValue) {
                        lengthSlider.value = newValue;
                        lengthValue.textContent = newValue;
                    }
                    if (vqaLengthSlider && vqaLengthValue) {
                        vqaLengthSlider.value = newValue;
                        vqaLengthValue.textContent = newValue;
                    }
                };

                if (lengthSlider) {
                    lengthSlider.addEventListener('input', (e) => {
                        syncLengthSliders(e.target);
                    });
                }
                if (vqaLengthSlider) {
                    vqaLengthSlider.addEventListener('input', (e) => {
                        syncLengthSliders(e.target);
                    });
                }

                // Add event listeners for button clicks
                sidebar.addEventListener('click', (e) => {
                    if (e.target.classList.contains('pill-button')) {
                        const buttonGroup = e.target.parentElement;
                        const buttons = buttonGroup.querySelectorAll('.pill-button');
                        
                        const isMultipleChoice = buttonGroup.parentElement.querySelector('.subsection-title')?.textContent.includes('multiple choice');
                        
                        if (!isMultipleChoice) {
                            buttons.forEach(btn => btn.classList.remove('active'));
                            e.target.classList.add('active');
                        } else {
                            e.target.classList.toggle('active');
                        }
                    }
                });

                const pauseAdGroup = sidebar.querySelector('#pause-ad-group');
                const audioDuckingSection = sidebar.querySelector('#audio-ducking-section');

                if (pauseAdGroup && audioDuckingSection) {
                    pauseAdGroup.addEventListener('click', (e) => {
                        if (e.target.classList.contains('pill-button')) {
                            const action = e.target.dataset.action;
                            if (action === 'pause-off') {
                                audioDuckingSection.style.display = 'block';
                            } else if (action === 'pause-on') {
                                audioDuckingSection.style.display = 'none';
                            }
                        }
                    });
                }

                // Chat Speech-to-text
                let isListeningChatMicButton = false;
                let recognitionChatMicButton = null;
                const chatMicButton = sidebar.querySelector('#chat-mic-button');
                chatMicButton.addEventListener('click', () => {
                    if (isListeningChatMicButton) {
                        recognitionChatMicButton.stop();
                        isListeningChatMicButton = false;
                        chatMicButton.classList.remove('listening');
                        try {
                            activationSound.play(); // Play sound on stop as well
                        } catch (error) {
                            console.error('Error playing activation sound:', error);
                        }
                    } else {
                        recognitionChatMicButton = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
                        recognitionChatMicButton.lang = 'en-US';
                        recognitionChatMicButton.interimResults = false;
                        recognitionChatMicButton.maxAlternatives = 1;

                        const activationSound = new Audio(chrome.runtime.getURL('assets/activation.mp3'));
                        try {
                            activationSound.play();
                        } catch (error) {
                            console.error('Error playing activation sound:', error);
                        }

                        recognitionChatMicButton.start();
                        isListeningChatMicButton = true;
                        chatMicButton.classList.add('listening');

                        recognitionChatMicButton.onresult = (event) => {
                            const chatInput = sidebar.querySelector('.chat-input');
                            chatInput.value = event.results[0][0].transcript;
                        };

                        recognitionChatMicButton.onspeechend = () => {
                            recognitionChatMicButton.stop();
                            isListeningChatMicButton = false;
                            chatMicButton.classList.remove('listening');
                            try {
                                activationSound.play();
                            } catch (error) {
                                console.error('Error playing activation sound:', error);
                            }
                        };

                        recognitionChatMicButton.onerror = (event) => {
                            console.error('Speech recognition error:', event.error);
                            isListeningChatMicButton = false;
                            chatMicButton.classList.remove('listening');
                        };
                    }
                });

                // Chat Text-to-speech
                const chatSpeakerButton = sidebar.querySelector('#chat-speaker-button');
                chatSpeakerButton.addEventListener('click', (event) => {
                    const thisButton = event.currentTarget;

                    if (currentAudio && !currentAudio.paused && currentPlayingButton === thisButton) {
                        currentAudio.pause();
                        currentAudio = null;
                        currentPlayingButton = null;
                        thisButton.textContent = '🔊';
                        return;
                    }

                    console.log('Chat speaker button clicked.');
                    const chatInput = sidebar.querySelector('.chat-input');
                    const textToSpeak = chatInput.value;

                    if (textToSpeak) {
                        chrome.runtime.sendMessage({
                            type: 'CALL_OPENAI_TTS',
                            text: textToSpeak
                        }, (ttsResponse) => {
                            if (ttsResponse && ttsResponse.success) {
                                playAudioFromDataUrl(ttsResponse.audioDataUrl, thisButton);
                            } else {
                                console.error('OpenAI TTS error:', ttsResponse?.error);
                            }
                        });
                    }
                });

                // Prevent arrow keys from controlling video when sidebar is focused
                sidebar.addEventListener('keydown', (e) => {
                    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                        e.stopPropagation();
                        e.preventDefault();
                    }
                });

                // Make sidebar focusable
                sidebar.setAttribute('tabindex', '0');

                secondary.prepend(sidebar);

                // Add timestamp functionality for CHAT tab
                const video = document.querySelector('video.html5-main-video');
                const vqaSendButton = sidebar.querySelector('#vqa-send-button');

                document.addEventListener('visibilitychange', () => {
                    if (document.visibilityState === 'hidden' && currentAudio) {
                        currentAudio.pause();
                        currentAudio = null;
                        if (currentPlayingButton) {
                            currentPlayingButton.textContent = '🔊';
                            currentPlayingButton = null;
                        }
                    }
                });

                if (video && vqaSendButton) {
                    video.addEventListener('timeupdate', () => {
                        const minutes = Math.floor(video.currentTime / 60);
                        const seconds = Math.floor(video.currentTime % 60).toString().padStart(2, '0');
                        vqaSendButton.textContent = `Ask question at ${minutes}:${seconds}`;
                    });

                    vqaSendButton.addEventListener('click', () => {
                        const chatInput = sidebar.querySelector('.chat-input');
                        const chatMessages = sidebar.querySelector('.chat-messages');
                        const question = chatInput.value.trim();

                        if (question) {
                            // Pause the video
                            video.pause();

                            // Create user message container with speaker button
                            const userMessageContainer = document.createElement('div');
                            userMessageContainer.style.display = 'flex';
                            userMessageContainer.style.alignItems = 'flex-start';
                            userMessageContainer.style.gap = '8px';
                            userMessageContainer.style.marginBottom = '12px';
                            userMessageContainer.style.justifyContent = 'flex-end';

                            const userSpeakerBtn = document.createElement('button');
                            userSpeakerBtn.textContent = '🔊';
                            userSpeakerBtn.style.background = 'none';
                            userSpeakerBtn.style.border = 'none';
                            userSpeakerBtn.style.fontSize = '18px';
                            userSpeakerBtn.style.cursor = 'pointer';
                            userSpeakerBtn.style.padding = '0';
                            userSpeakerBtn.style.marginTop = '8px';
                            userSpeakerBtn.style.opacity = '0.5';
                            userSpeakerBtn.style.transition = 'opacity 0.2s';
                            
                            userSpeakerBtn.addEventListener('mouseover', () => userSpeakerBtn.style.opacity = '1');
                            userSpeakerBtn.addEventListener('mouseout', () => userSpeakerBtn.style.opacity = '0.5');
                            
                            userSpeakerBtn.addEventListener('click', (event) => {
                                const thisButton = event.currentTarget;

                                if (currentAudio && !currentAudio.paused && currentPlayingButton === thisButton) {
                                    currentAudio.pause();
                                    currentAudio = null;
                                    currentPlayingButton = null;
                                    thisButton.textContent = '🔊';
                                    return;
                                }

                                const textToSpeak = userMessage.textContent;
                                if (textToSpeak) {
                                    chrome.runtime.sendMessage({
                                        type: 'CALL_OPENAI_TTS',
                                        text: textToSpeak
                                    }, (ttsResponse) => {
                                        if (ttsResponse && ttsResponse.success) {
                                            playAudioFromDataUrl(ttsResponse.audioDataUrl, thisButton);
                                        } else {
                                            console.error('OpenAI TTS error:', ttsResponse?.error);
                                        }
                                    });
                                }
                            });

                            const userMessage = document.createElement('div');
                            userMessage.className = 'chat-message user-message';
                            userMessage.textContent = question;
                            userMessage.style.flex = '1';

                            userMessageContainer.appendChild(userSpeakerBtn);
                            userMessageContainer.appendChild(userMessage);
                            chatMessages.appendChild(userMessageContainer);

                            chatInput.value = '';
                            chatInput.style.height = 'auto'; // Reset height

                            // Create AI message container with speaker button
                            const aiMessageContainer = document.createElement('div');
                            aiMessageContainer.style.display = 'flex';
                            aiMessageContainer.style.alignItems = 'flex-start';
                            aiMessageContainer.style.gap = '8px';
                            aiMessageContainer.style.marginBottom = '12px';

                            const aiMessage = document.createElement('div');
                            aiMessage.className = 'chat-message bot-message';
                            aiMessage.textContent = 'Thinking...';
                            aiMessage.style.flex = '1';

                            const speakerBtn = document.createElement('button');
                            speakerBtn.textContent = '🔊';
                            speakerBtn.style.background = 'none';
                            speakerBtn.style.border = 'none';
                            speakerBtn.style.fontSize = '18px';
                            speakerBtn.style.cursor = 'pointer';
                            speakerBtn.style.padding = '0';
                            speakerBtn.style.marginTop = '8px';
                            speakerBtn.style.opacity = '0.5';
                            speakerBtn.style.transition = 'opacity 0.2s';
                            
                            speakerBtn.addEventListener('mouseover', () => speakerBtn.style.opacity = '1');
                            speakerBtn.addEventListener('mouseout', () => speakerBtn.style.opacity = '0.5');
                            
                            speakerBtn.addEventListener('click', (event) => {
                                const thisButton = event.currentTarget;

                                if (currentAudio && !currentAudio.paused && currentPlayingButton === thisButton) {
                                    currentAudio.pause();
                                    currentAudio = null;
                                    currentPlayingButton = null;
                                    thisButton.textContent = '🔊';
                                    return;
                                }

                                const textToSpeak = aiMessage.textContent;
                                if (textToSpeak && textToSpeak !== 'Thinking...') {
                                    chrome.runtime.sendMessage({
                                        type: 'CALL_OPENAI_TTS',
                                        text: textToSpeak
                                    }, (ttsResponse) => {
                                        if (ttsResponse && ttsResponse.success) {
                                            playAudioFromDataUrl(ttsResponse.audioDataUrl, thisButton);
                                        } else {
                                            console.error('OpenAI TTS error:', ttsResponse?.error);
                                        }
                                    });
                                }
                            });

                            aiMessageContainer.appendChild(aiMessage);
                            aiMessageContainer.appendChild(speakerBtn);
                            chatMessages.appendChild(aiMessageContainer);

                            // Scroll to the bottom of the chat
                            chatMessages.scrollTop = chatMessages.scrollHeight;

                            const currentTime = video.currentTime;

                            const callGemini = async () => {
                                try {
                                    const youtubeUrl = window.location.href;
                                    const currentTime = video.currentTime;

                                    // Capture video frame
                                    console.log('Capturing video frame...');
                                    const canvas = document.createElement('canvas');
                                    canvas.width = video.videoWidth;
                                    canvas.height = video.videoHeight;
                                    const ctx = canvas.getContext('2d');
                                    ctx.drawImage(video, 0, 0);
                                    const frameData = canvas.toDataURL('image/jpeg').split(',')[1]; // Remove data URL prefix

                                    // Format timestamp
                                    const formatTime = (seconds) => {
                                        const mins = Math.floor(seconds / 60);
                                        const secs = Math.floor(seconds % 60);
                                        return `${mins}:${secs.toString().padStart(2, '0')}`;
                                    };

                                    const vqaLengthSlider = sidebar.querySelector('#vqa-length-slider');
                                    const wordCount = vqaLengthSlider ? vqaLengthSlider.value : 20;

                                    const prompt = `User is watching a YouTube video at timestamp ${formatTime(currentTime)}.
User's question: "${question}"

Please analyze the video frame shown and answer their question about what's happening in the video at this moment. Please answer in approximately ${wordCount} words.`;

                                    console.log('Sending CALL_GEMINI message with video frame to background script');
                                    // Send message to background script with the video frame
                                    chrome.runtime.sendMessage({
                                        type: 'CALL_GEMINI',
                                        prompt: prompt,
                                        frameData: frameData
                                    }, (response) => {
                                        console.log('Received response from background:', response);
                                        if (response && response.success) {
                                            aiMessage.textContent = response.text;
                                            speakerBtn.style.opacity = '1';
                                            
                                            // Auto-play voice response with VQA settings
                                            chrome.runtime.sendMessage({
                                                type: 'CALL_OPENAI_TTS',
                                                text: response.text
                                            }, (ttsResponse) => {
                                                if (ttsResponse && ttsResponse.success) {
                                                    playAudioFromDataUrl(ttsResponse.audioDataUrl);
                                                } else {
                                                    console.error('OpenAI TTS error:', ttsResponse?.error);
                                                }
                                            });
                                        } else {
                                            aiMessage.textContent = `Error: ${response?.error || 'Unknown error occurred'}`;
                                            console.error('Gemini API error:', response?.error);
                                        }
                                    });
                                } catch (error) {
                                    console.error("Error calling Gemini API:", error);
                                    aiMessage.textContent = `Error: ${error.message}`;
                                }
                            };

                            callGemini();
                        }
                    });
                }
                
                return true;
            }
        }
        return false;
    };

    const init = () => {
        newVideoLoaded();
    };

    // Initial load
    init();

    // Handle navigations in YouTube (which is a single-page app)
    document.addEventListener("yt-navigate-finish", () => {
        // Remove old sidebar if it exists
        const oldSidebar = document.getElementById("custom-qa-sidebar");
        if (oldSidebar) {
            oldSidebar.remove();
        }
        // Try to inject sidebar on new page
        init();
    });

    // Handle messages from the popup
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.type === "GET_TIMESTAMP") {
            const video = document.querySelector('.html5-main-video');
            if (video) {
                sendResponse({ timestamp: video.currentTime });
            } else {
                sendResponse({ timestamp: null });
            }
        }
        return true; // Indicates that the response is sent asynchronously
    });
})();
