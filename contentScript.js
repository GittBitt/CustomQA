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

                sidebar.innerHTML = html;

                // Tab switching functionality
                const tabButtons = sidebar.querySelectorAll('.tab-button');
                const tabContents = sidebar.querySelectorAll('.tab-content');
                
                tabButtons.forEach(button => {
                    button.addEventListener('click', () => {
                        const tabName = button.getAttribute('data-tab');
                        
                        // Update active tab button
                        tabButtons.forEach(btn => btn.classList.remove('active'));
                        button.classList.add('active');
                        
                        // Show corresponding content
                        tabContents.forEach(content => {
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

                // Sync speed and volume sliders
                const adSpeedSlider = sidebar.querySelector('#ad-speed-slider');
                const adVolumeSlider = sidebar.querySelector('#ad-volume-slider');
                const vqaSpeedSlider = sidebar.querySelector('#vqa-speed-slider');
                const vqaVolumeSlider = sidebar.querySelector('#vqa-volume-slider');

                adSpeedSlider.addEventListener('input', (e) => {
                    vqaSpeedSlider.value = e.target.value;
                });

                vqaSpeedSlider.addEventListener('input', (e) => {
                    adSpeedSlider.value = e.target.value;
                });

                adVolumeSlider.addEventListener('input', (e) => {
                    vqaVolumeSlider.value = e.target.value;
                });

                vqaVolumeSlider.addEventListener('input', (e) => {
                    adVolumeSlider.value = e.target.value;
                });

                // Add event listeners for button clicks
                const syncPresentationButtons = (button) => {
                    const voice = button.getAttribute('data-voice');
                    const gender = button.getAttribute('data-gender');
                    const sourceTab = button.closest('.tab-content').id;

                    if (voice) {
                        const otherTab = sourceTab === 'audio-descriptions-tab' ? 'vqa-tab' : 'audio-descriptions-tab';
                        const otherButtons = sidebar.querySelectorAll(`#${otherTab} [data-voice]`);
                        otherButtons.forEach(btn => {
                            btn.classList.remove('active');
                            if (btn.getAttribute('data-voice') === voice) {
                                btn.classList.add('active');
                            }
                        });
                    }

                    if (gender) {
                        const otherTab = sourceTab === 'audio-descriptions-tab' ? 'vqa-tab' : 'audio-descriptions-tab';
                        const otherButtons = sidebar.querySelectorAll(`#${otherTab} [data-gender]`);
                        otherButtons.forEach(btn => {
                            btn.classList.remove('active');
                            if (btn.getAttribute('data-gender') === gender) {
                                btn.classList.add('active');
                            }
                        });
                    }
                };

                sidebar.addEventListener('click', (e) => {
                    if (e.target.classList.contains('pill-button')) {
                        const buttonGroup = e.target.parentElement;
                        const buttons = buttonGroup.querySelectorAll('.pill-button');
                        
                        const isMultipleChoice = buttonGroup.parentElement.querySelector('.subsection-title')?.textContent.includes('multiple choice');
                        
                        if (!isMultipleChoice) {
                            buttons.forEach(btn => btn.classList.remove('active'));
                            e.target.classList.add('active');
                            if (e.target.hasAttribute('data-voice') || e.target.hasAttribute('data-gender')) {
                                syncPresentationButtons(e.target);
                            }
                        } else {
                            e.target.classList.toggle('active');
                        }
                    }
                });

                // Auto-resize textarea
                const questionInput = sidebar.querySelector('#question-input');
                const answerBox = sidebar.querySelector('#answer-box'); // Get answerBox here

                questionInput.addEventListener('input', () => {
                    questionInput.style.height = 'auto';
                    questionInput.style.height = `${questionInput.scrollHeight}px`;
                    answerBox.textContent = questionInput.value; // Mirror question to answer
                });

                // Speech-to-text
                const micButton = sidebar.querySelector('#mic-button');
                micButton.addEventListener('click', () => {
                    const recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
                    recognition.lang = 'en-US';
                    recognition.interimResults = false;
                    recognition.maxAlternatives = 1;

                    const activationSound = new Audio(chrome.runtime.getURL('assets/activation.mp3'));
                    console.log('activationSound:', activationSound);
                    try {
                        activationSound.play();
                    } catch (error) {
                        console.error('Error playing activation sound:', error);
                    }

                    recognition.start();

                    recognition.onresult = (event) => {
                        questionInput.value = event.results[0][0].transcript;
                    };

                    recognition.onspeechend = () => {
                        recognition.stop();
                        try {
                            activationSound.play();
                        } catch (error) {
                            console.error('Error playing activation sound:', error);
                        }
                    };

                    recognition.onerror = (event) => {
                        console.error('Speech recognition error:', event.error);
                    };
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
})();
