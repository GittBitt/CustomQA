(() => {
    const newVideoLoaded = async () => {
        if (!window.location.href.includes('watch?v=')) {
            return false;
        }

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


                // VQA sub-tab switching
                const vqaSubTabButtons = sidebar.querySelectorAll('.vqa-sub-tab-button');
                const vqaSubTabContents = sidebar.querySelectorAll('.vqa-sub-tab-content');

                vqaSubTabButtons.forEach(button => {
                    button.addEventListener('click', () => {
                        const tabName = button.getAttribute('data-tab');

                        vqaSubTabButtons.forEach(btn => btn.classList.remove('active'));
                        button.classList.add('active');

                        vqaSubTabContents.forEach(content => {
                            content.style.display = 'none';
                        });
                        sidebar.querySelector(`#${tabName}-tab`).style.display = 'block';
                    });
                });

                // Length slider update
                const lengthSlider = sidebar.querySelector('#length-slider');
                const lengthValue = sidebar.querySelector('#length-value');
                
                if (lengthSlider && lengthValue) {
                    lengthSlider.addEventListener('input', (e) => {
                        lengthValue.textContent = e.target.value;
                    });
                }

                const vqaLengthSlider = sidebar.querySelector('#vqa-length-slider');
                const vqaLengthValue = sidebar.querySelector('#vqa-length-value');

                if (vqaLengthSlider && vqaLengthValue) {
                    vqaLengthSlider.addEventListener('input', (e) => {
                        vqaLengthValue.textContent = e.target.value;
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

                // Auto-resize textarea
                const questionInput = sidebar.querySelector('#question-input');
                const answerBox = sidebar.querySelector('#answer-box'); // Get answerBox here

                questionInput.addEventListener('input', () => {
                    questionInput.style.height = 'auto';
                    questionInput.style.height = `${questionInput.scrollHeight}px`;
                    answerBox.textContent = questionInput.value; // Mirror question to answer
                });

                // Speech-to-text
                let isListeningMicButton = false;
                let recognitionMicButton = null;
                const micButton = sidebar.querySelector('#mic-button');
                const activationSound = new Audio(chrome.runtime.getURL('assets/activation.mp3'));
                micButton.addEventListener('click', () => {
                    if (isListeningMicButton) {
                        recognitionMicButton.stop();
                        isListeningMicButton = false;
                        micButton.classList.remove('listening');
                        try {
                            activationSound.play(); // Play sound on stop as well
                            console.log('activationSound:', activationSound);
                        } catch (error) {
                            console.error('Error playing activation sound:', error);
                        }
                    } else {
                        recognitionMicButton = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
                        recognitionMicButton.lang = 'en-US';
                        recognitionMicButton.interimResults = false;
                        recognitionMicButton.maxAlternatives = 1;

                        console.log('activationSound:', activationSound);
                        try {
                            activationSound.play();
                        } catch (error) {
                            console.error('Error playing activation sound:', error);
                        }

                        recognitionMicButton.start();
                        isListeningMicButton = true;
                        micButton.classList.add('listening');

                        recognitionMicButton.onresult = (event) => {
                            questionInput.value = event.results[0][0].transcript;
                        };

                        recognitionMicButton.onspeechend = () => {
                            recognitionMicButton.stop();
                            isListeningMicButton = false;
                            micButton.classList.remove('listening');
                            try {
                                activationSound.play();
                            } catch (error) {
                                console.error('Error playing activation sound:', error);
                            }
                        };

                        recognitionMicButton.onerror = (event) => {
                            console.error('Speech recognition error:', event.error);
                            isListeningMicButton = false;
                            micButton.classList.remove('listening');
                        };
                    }
                });

                // Text-to-speech
                const speakerButton = sidebar.querySelector('#speaker-button');
                speakerButton.addEventListener('click', () => {
                    const answerBox = sidebar.querySelector('#answer-box');
                    const textToSpeak = answerBox.textContent;

                    if (textToSpeak) {
                        const utterance = new SpeechSynthesisUtterance(textToSpeak);
                        speechSynthesis.speak(utterance);
                    }
                });

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
                chatSpeakerButton.addEventListener('click', () => {
                    const chatInput = sidebar.querySelector('.chat-input');
                    const textToSpeak = chatInput.value;

                    if (textToSpeak) {
                        const utterance = new SpeechSynthesisUtterance(textToSpeak);
                        speechSynthesis.speak(utterance);
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

                // Add timestamp functionality
                const video = document.querySelector('video.html5-main-video');
                const vqaSendButton = sidebar.querySelector('#vqa-send-button');

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
                            // Display user message
                            const userMessage = document.createElement('div');
                            userMessage.className = 'chat-message user-message';
                            userMessage.textContent = question;
                            chatMessages.appendChild(userMessage);

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
                            
                            speakerBtn.addEventListener('click', () => {
                                const textToSpeak = aiMessage.textContent;
                                if (textToSpeak && textToSpeak !== 'Thinking...') {
                                    const utterance = new SpeechSynthesisUtterance(textToSpeak);
                                    window.speechSynthesis.speak(utterance);
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

                                    // Format timestamp
                                    const formatTime = (seconds) => {
                                        const mins = Math.floor(seconds / 60);
                                        const secs = Math.floor(seconds % 60);
                                        return `${mins}:${secs.toString().padStart(2, '0')}`;
                                    };

                                    const prompt = `User is watching a YouTube video at timestamp ${formatTime(currentTime)}.
Video URL: ${youtubeUrl}
User's question: "${question}"

Note: I don't have access to the actual video content, so I can only provide general guidance based on the question and timestamp. Please answer their question based on what they're likely asking about, or ask for clarification if needed. Keep the response concise and helpful.`;

                                    console.log('Sending CALL_GEMINI message to background script');
                                    // Send message to background script to avoid CORS issues
                                    chrome.runtime.sendMessage({
                                        type: 'CALL_GEMINI',
                                        prompt: prompt
                                    }, (response) => {
                                        console.log('Received response from background:', response);
                                        if (response && response.success) {
                                            aiMessage.textContent = response.text;
                                            speakerBtn.style.opacity = '1';
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
