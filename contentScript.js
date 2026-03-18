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

        const video = document.querySelector('video.html5-main-video');
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
            
            // Get speed from whichever slider is available (AD or VQA)
            const adSpeedSlider = document.getElementById('ad-speed-slider');
            const vqaSpeedSlider = document.getElementById('vqa-speed-slider');
            const speedSlider = adSpeedSlider || vqaSpeedSlider;
            
            if (speedSlider) {
                audio.playbackRate = parseFloat(speedSlider.value) / 50;
                console.log('Current playback speed:', audio.playbackRate);
            } else {
                console.log('Speed Slider not found, defaulting to 1x speed.');
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

                // Speed slider sync
                const adSpeedSlider = sidebar.querySelector('#ad-speed-slider');
                const vqaSpeedSlider = sidebar.querySelector('#vqa-speed-slider');

                const syncSpeedSliders = (sourceSlider) => {
                    const newValue = sourceSlider.value;
                    if (adSpeedSlider) adSpeedSlider.value = newValue;
                    if (vqaSpeedSlider) vqaSpeedSlider.value = newValue;
                };

                if (adSpeedSlider) {
                    adSpeedSlider.addEventListener('input', (e) => {
                        syncSpeedSliders(e.target);
                    });
                }
                if (vqaSpeedSlider) {
                    vqaSpeedSlider.addEventListener('input', (e) => {
                        syncSpeedSliders(e.target);
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
                    const genderBtn = sidebar.querySelector('#vqa-gender-group .pill-button.active');
                    const gender = genderBtn ? genderBtn.dataset.gender : 'female';

                    if (textToSpeak) {
                        chrome.runtime.sendMessage({
                            type: 'CALL_OPENAI_TTS',
                            text: textToSpeak,
                            gender: gender
                        }, (ttsResponse) => {
                            if (ttsResponse && ttsResponse.success) {
                                playAudioFromDataUrl(ttsResponse.audioDataUrl, thisButton);
                            } else {
                                console.error('OpenAI TTS error:', ttsResponse?.error);
                            }
                        });
                    }
                });

                let adSchedule = [];

                const captureVideoFrame = async (timeInSeconds) => {
                    return new Promise((resolve, reject) => {
                        const originalTime = video.currentTime;
                        const seekHandler = () => {
                            try {
                                const canvas = document.createElement('canvas');
                                canvas.width = video.videoWidth;
                                canvas.height = video.videoHeight;
                                const ctx = canvas.getContext('2d');
                                ctx.drawImage(video, 0, 0);
                                const frameData = canvas.toDataURL('image/jpeg').split(',')[1];
                                
                                video.removeEventListener('seeked', seekHandler);
                                video.currentTime = originalTime;
                                resolve(frameData);
                            } catch (error) {
                                video.removeEventListener('seeked', seekHandler);
                                video.currentTime = originalTime;
                                reject(error);
                            }
                        };
                        video.addEventListener('seeked', seekHandler, { once: true });
                        video.currentTime = timeInSeconds;
                    });
                };

                const generateAdButton = sidebar.querySelector('#generate-ad-button');
                if (generateAdButton) {
                    generateAdButton.addEventListener('click', async () => {
                        if (!video) {
                            console.error('Video element not found.');
                            return;
                        }
                        
                        const duration = video.duration;
                        const frequency = sidebar.querySelector('.pill-button[data-frequency].active')?.dataset.frequency || 'sometimes';
                        
                        let interval;
                        switch (frequency) {
                            case 'rarely':
                                interval = 120;
                                break;
                            case 'sometimes':
                                interval = 60;
                                break;
                            case 'often':
                                interval = 30;
                                break;
                            case 'very':
                                interval = 15;
                                break;
                            default:
                                interval = 60;
                        }

                        const timestamps = [];
                        for (let i = 0; i < duration; i += interval) {
                            timestamps.push(i);
                        }

                        console.log('[AD] Capturing frames at timestamps:', timestamps);
                        generateAdButton.textContent = 'Capturing frames...';
                        generateAdButton.disabled = true;

                        try {
                            const frames = [];
                            for (const timestamp of timestamps) {
                                try {
                                    console.log(`[AD] Capturing frame at ${timestamp}s`);
                                    const frameData = await captureVideoFrame(timestamp);
                                    frames.push({
                                        timestamp: timestamp,
                                        frameData: frameData
                                    });
                                } catch (error) {
                                    console.error(`[AD] Failed to capture frame at ${timestamp}s:`, error);
                                }
                            }

                            if (frames.length === 0) {
                                console.error('No frames captured.');
                                generateAdButton.textContent = 'GENERATE AD';
                                generateAdButton.disabled = false;
                                return;
                            }

                            console.log('[AD] Frame capture complete. Sending to Gemini...');
                            generateAdButton.textContent = 'Generating descriptions...';

                            const customizations = {
                                length: sidebar.querySelector('#length-slider').value,
                                emphasis: sidebar.querySelector('.pill-button[data-emphasis].active')?.dataset.emphasis || 'balanced',
                                subjectiveness: sidebar.querySelector('.pill-button[data-narration].active')?.dataset.narration || 'objective',
                                colorPreference: sidebar.querySelector('.pill-button[data-color].active')?.dataset.color || 'on',
                            };

                            const videoUrl = window.location.href;

                            chrome.runtime.sendMessage({
                                type: 'CALL_GEMINI_FOR_AD',
                                customizations: customizations,
                                frames: frames,
                                videoUrl: videoUrl
                            }, (response) => {
                                generateAdButton.textContent = 'GENERATE AD';
                                generateAdButton.disabled = false;

                                if (response && response.success) {
                                    console.log('AD Generation successful:', response.text);
                                    try {
                                        // Strip markdown and parse
                                        const jsonString = response.text.replace(/```json\n|```/g, '');
                                        const adData = JSON.parse(jsonString);
                                        
                                        let descriptions = [];
                                        if (adData.VideoMetadata && adData.VideoMetadata.audio_descriptions) {
                                            descriptions = adData.VideoMetadata.audio_descriptions;
                                        } else if (adData.audio_descriptions) {
                                            descriptions = adData.audio_descriptions;
                                        } else if (adData.VideoMetadata && adData.VideoMetadata.AudioDescriptions) {
                                            descriptions = adData.VideoMetadata.AudioDescriptions;
                                        }

                                        adSchedule = descriptions.map(desc => ({
                                            timestamp: (desc.timestamp_ms || desc.timestamp_in_seconds * 1000) / 1000,
                                            description: desc.description,
                                            played: false
                                        }));
                                        displayAdBubbles(adSchedule);
                                    } catch (e) {
                                        console.error('Error parsing AD response:', e);
                                        alert('Error parsing audio descriptions. Check console for details.');
                                    }
                                } else {
                                    console.error('AD Generation error:', response?.error);
                                    alert(`AD Generation error: ${response?.error || 'Unknown error'}`);
                                }
                            });
                        } catch (error) {
                            console.error('Error during frame capture:', error);
                            generateAdButton.textContent = 'GENERATE AD';
                            generateAdButton.disabled = false;
                            alert(`Error capturing frames: ${error.message}`);
                        }
                    });
                }

                const displayAdBubbles = (descriptions) => {
                    console.log('Displaying AD bubbles:', descriptions);
                    const adMessages = sidebar.querySelector('#ad-messages');
                    adMessages.innerHTML = '';
                    
                    // Get gender with fallback
                    const genderButton = sidebar.querySelector('#vqa-gender-group .pill-button.active');
                    const gender = genderButton ? genderButton.dataset.gender : 'female'; // Default to female if not found
                    
                    descriptions.forEach((desc, index) => {
                        // Create container for message + speaker button
                        const messageContainer = document.createElement('div');
                        messageContainer.style.display = 'flex';
                        messageContainer.style.alignItems = 'flex-start';
                        messageContainer.style.gap = '8px';
                        messageContainer.style.marginBottom = '12px';
                        
                        // Calculate timestamp range
                        const currentTs = desc.timestamp;
                        const nextTs = descriptions[index + 1]?.timestamp || video.duration;
                        const tsRange = `${formatTime(currentTs)} - ${formatTime(nextTs)}`;
                        
                        // Create message bubble
                        const bubble = document.createElement('div');
                        bubble.className = 'chat-message bot-message';
                        bubble.textContent = `[${tsRange}] ${desc.description}`;
                        bubble.style.flex = '1';
                        
                        // Create speaker button
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
                            
                            const textToSpeak = desc.description;
                            
                            if (textToSpeak) {
                                chrome.runtime.sendMessage({
                                    type: 'CALL_OPENAI_TTS',
                                    text: textToSpeak,
                                    gender: gender
                                }, (ttsResponse) => {
                                    if (ttsResponse && ttsResponse.success) {
                                        playAudioFromDataUrl(ttsResponse.audioDataUrl, thisButton);
                                    } else {
                                        console.error('OpenAI TTS error:', ttsResponse?.error);
                                    }
                                });
                            }
                        });
                        
                        messageContainer.appendChild(bubble);
                        messageContainer.appendChild(speakerBtn);
                        adMessages.appendChild(messageContainer);
                    });
                };

                const formatTime = (seconds) => {
                    const mins = Math.floor(seconds / 60);
                    const secs = Math.floor(seconds % 60);
                    return `${mins}:${secs.toString().padStart(2, '0')}`;
                };

                if (video) {
                    video.addEventListener('timeupdate', () => {
                        if (adSchedule.length > 0) {
                            const currentTime = video.currentTime;
                            const nextAd = adSchedule.find(ad => currentTime >= ad.timestamp && !ad.played);
                            if (nextAd) {
                                nextAd.played = true;
                                // ALWAYS pause for AD playback
                                console.log('[AD] Pausing video at', currentTime, 'for AD');
                                video.pause();
                                
                                const genderBtnAD = sidebar.querySelector('#vqa-gender-group .pill-button.active');
                                const gender = genderBtnAD ? genderBtnAD.dataset.gender : 'female';
                                chrome.runtime.sendMessage({
                                    type: 'CALL_OPENAI_TTS',
                                    text: nextAd.description,
                                    gender: gender
                                }, (ttsResponse) => {
                                    if (ttsResponse && ttsResponse.success) {
                                        const audio = playAudioFromDataUrl(ttsResponse.audioDataUrl, null);
                                        if (audio) {
                                            audio.onended = () => {
                                                console.log('[AD] AD audio ended, resuming video');
                                                video.play();
                                            };
                                        }
                                    } else {
                                        console.error('OpenAI TTS error:', ttsResponse?.error);
                                        // Resume video on error
                                        video.play();
                                    }
                                });
                            }
                        }
                    });
                }

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
                const vqaSendButton = sidebar.querySelector('#vqa-send-button');
                const timeWindowSlider = sidebar.querySelector('#time-window-slider');
                const timeWindowValue = sidebar.querySelector('#time-window-value');

                if (timeWindowSlider && timeWindowValue) {
                    timeWindowSlider.addEventListener('input', (e) => {
                        const value = e.target.value;
                        if (value % 60 === 0) {
                            const minutes = value / 60;
                            timeWindowValue.textContent = `${minutes}min`;
                        } else {
                            timeWindowValue.textContent = `${value}s`;
                        }
                    });
                }

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
                        const chatInput = sidebar.querySelector('#vqa-tab .chat-input');
                        const chatMessages = sidebar.querySelector('#vqa-tab .chat-messages');
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
                                const genderBtnUser = sidebar.querySelector('#vqa-gender-group .pill-button.active');
                                const genderUser = genderBtnUser ? genderBtnUser.dataset.gender : 'female';
                                if (textToSpeak) {
                                    chrome.runtime.sendMessage({
                                        type: 'CALL_OPENAI_TTS',
                                        text: textToSpeak,
                                        gender: genderUser
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
                                const genderBtnAI = sidebar.querySelector('#vqa-gender-group .pill-button.active');
                                const genderAI = genderBtnAI ? genderBtnAI.dataset.gender : 'female';
                                if (textToSpeak && textToSpeak !== 'Thinking...') {
                                    chrome.runtime.sendMessage({
                                        type: 'CALL_OPENAI_TTS',
                                        text: textToSpeak,
                                        gender: gender
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

                            const callGemini = async () => {
                                try {
                                    const youtubeUrl = window.location.href;
                                    const currentTime = video.currentTime;
                                    const timeWindow = parseInt(timeWindowSlider.value, 10);

                                    const frames = [];
                                    if (timeWindow > 0) {
                                        aiMessage.textContent = `Capturing frames for ±${timeWindow}s...`;
                                        const start = Math.max(0, currentTime - timeWindow);
                                        const end = Math.min(video.duration, currentTime + timeWindow);
                                        
                                        // Capture one frame per second
                                        for (let i = start; i <= end; i++) {
                                            try {
                                                console.log(`[VQA] Capturing frame at ${i}s`);
                                                const frameData = await captureVideoFrame(i);
                                                frames.push({
                                                    timestamp: i,
                                                    frameData: frameData
                                                });
                                            } catch (error) {
                                                console.error(`[VQA] Failed to capture frame at ${i}s:`, error);
                                            }
                                        }
                                        aiMessage.textContent = 'Thinking...';
                                    } else {
                                        // Capture only the current frame if timeWindow is 0
                                        const frameData = await captureVideoFrame(currentTime);
                                        frames.push({
                                            timestamp: currentTime,
                                            frameData: frameData
                                        });
                                    }

                                    if (frames.length === 0) {
                                        throw new Error("Could not capture any video frames.");
                                    }

                                    const formatTime = (seconds) => {
                                        const mins = Math.floor(seconds / 60);
                                        const secs = Math.floor(seconds % 60);
                                        return `${mins}:${secs.toString().padStart(2, '0')}`;
                                    };

                                    const vqaLengthSlider = sidebar.querySelector('#vqa-length-slider');
                                    const wordCount = vqaLengthSlider ? vqaLengthSlider.value : 20;

                                    const prompt = `User is watching a YouTube video at timestamp ${formatTime(currentTime)}.
User's question: "${question}"

Please analyze the video frames provided and answer their question about what's happening in the video. The frames are captured around the given timestamp. Please answer in approximately ${wordCount} words.`;

                                    console.log('Sending CALL_GEMINI message with frames to background script');
                                    chrome.runtime.sendMessage({
                                        type: 'CALL_GEMINI_VQA_MULTIFRAME',
                                        prompt: prompt,
                                        frames: frames
                                    }, (response) => {
                                        console.log('Received response from background:', response);
                                        if (response && response.success) {
                                            aiMessage.textContent = response.text;
                                            speakerBtn.style.opacity = '1';
                                            
                                            const genderBtnResp = sidebar.querySelector('#vqa-gender-group .pill-button.active');
                                            const genderResp = genderBtnResp ? genderBtnResp.dataset.gender : 'female';
                                            chrome.runtime.sendMessage({
                                                type: 'CALL_OPENAI_TTS',
                                                text: response.text,
                                                gender: genderResp
                                            }, (ttsResponse) => {
                                                if (ttsResponse && ttsResponse.success) {
                                                    playAudioFromDataUrl(ttsResponse.audioDataUrl, speakerBtn);
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
