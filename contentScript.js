(() => {
    const createSidebarContent = () => {
        return `
            <style>
                #custom-qa-sidebar * {
                    box-sizing: border-box;
                }
                
                #custom-qa-sidebar {
                    box-sizing: border-box;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    color: #000;
                    max-width: 400px;
                    margin: 0 auto;
                }
                
                .sidebar-header {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    margin-bottom: 20px;
                }
                
                .sidebar-title-group {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }
                
                .sidebar-star {
                    font-size: 24px;
                }
                
                .sidebar-title {
                    display: flex;
                    flex-direction: column;
                }
                
                .sidebar-title-main {
                    font-size: 16px;
                    font-weight: 600;
                    line-height: 1.2;
                }
                
                .sidebar-title-sub {
                    font-size: 14px;
                    font-weight: 400;
                    color: #333;
                }
                
                .sidebar-header-actions {
                    display: flex;
                    gap: 8px;
                    align-items: center;
                }
                
                .vqa-badge {
                    background: #000;
                    color: #fff;
                    padding: 6px 12px;
                    border-radius: 20px;
                    font-size: 12px;
                    font-weight: 600;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                }
                
                .settings-icon {
                    width: 32px;
                    height: 32px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    color: #606060;
                    font-size: 20px;
                }
                
                .tab-container {
                    display: flex;
                    gap: 8px;
                    margin-bottom: 20px;
                    border-bottom: 2px solid #e0e0e0;
                }
                
                .tab-button {
                    flex: 1;
                    padding: 12px 16px;
                    background: none;
                    border: none;
                    border-bottom: 3px solid transparent;
                    font-size: 13px;
                    font-weight: 600;
                    cursor: pointer;
                    color: #666;
                    transition: all 0.2s;
                    margin-bottom: -2px;
                }
                
                .tab-button.active {
                    color: #000;
                    border-bottom-color: #000;
                }
                
                .tab-button:hover {
                    color: #000;
                }
                
                .tab-content {
                    animation: fadeIn 0.3s;
                }
                
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                
                .section {
                    margin-bottom: 24px;
                }
                
                .section-title {
                    font-size: 18px;
                    font-weight: 600;
                    margin-bottom: 12px;
                }
                
                .subsection-title {
                    font-size: 14px;
                    font-weight: 500;
                    margin-bottom: 8px;
                }
                
                .button-group {
                    display: flex;
                    gap: 8px;
                    overflow-x: auto;
                    scrollbar-width: none;
                    -ms-overflow-style: none;
                }
                
                .button-group::-webkit-scrollbar {
                    display: none;
                }
                
                .pill-button {
                    padding: 8px 20px;
                    border-radius: 20px;
                    border: none;
                    font-size: 13px;
                    font-weight: 500;
                    cursor: pointer;
                    white-space: nowrap;
                    transition: all 0.2s;
                    flex-shrink: 0;
                    background: #e0e0e0;
                    color: #000;
                }
                
                .pill-button.active {
                    background: #000;
                    color: #fff;
                }
                
                .pill-button:hover {
                    opacity: 0.8;
                }
                
                .slider-container {
                    margin-bottom: 16px;
                }
                
                .slider-label {
                    font-size: 14px;
                    font-weight: 500;
                    margin-bottom: 8px;
                }
                
                .slider {
                    width: 100%;
                    height: 4px;
                    border-radius: 2px;
                    background: #e0e0e0;
                    outline: none;
                    -webkit-appearance: none;
                }
                
                .slider::-webkit-slider-thumb {
                    -webkit-appearance: none;
                    appearance: none;
                    width: 16px;
                    height: 16px;
                    border-radius: 50%;
                    background: #000;
                    cursor: pointer;
                }
                
                .slider::-moz-range-thumb {
                    width: 16px;
                    height: 16px;
                    border-radius: 50%;
                    background: #000;
                    cursor: pointer;
                    border: none;
                }
                
                .divider {
                    height: 1px;
                    background: #ddd;
                    margin: 24px 0;
                }
                
                .save-button {
                    width: 100%;
                    padding: 12px;
                    background: #000;
                    color: #fff;
                    border: none;
                    border-radius: 24px;
                    font-size: 14px;
                    font-weight: 600;
                    cursor: pointer;
                    margin-top: 20px;
                    transition: all 0.2s;
                }
                
                .save-button:hover {
                    background: #333;
                }
            </style>
            
            <div class="sidebar-header">
                <div class="sidebar-title-group">
                    <span class="sidebar-star">✦</span>
                    <div class="sidebar-title">
                        <span class="sidebar-title-main">CustomQA</span>
                        <span class="sidebar-title-sub">Sidebar Plugin</span>
                    </div>
                </div>
                <div class="sidebar-header-actions">
                    <div class="settings-icon">⚙️</div>
                </div>
            </div>
            
            <div class="tab-container">
                <button class="tab-button active" data-tab="audio-descriptions">Audio Descriptions</button>
                <button class="tab-button" data-tab="vqa">Visual Question Answer</button>
            </div>
            
            <div class="tab-content" id="audio-descriptions-tab">
                <div class="section">
                    <div class="section-title">PRESENTATION CUSTOMIZATION</div>
                    
                    <div class="slider-container">
                        <div class="slider-label">Speed:</div>
                        <input type="range" min="0" max="100" value="50" class="slider" id="ad-speed-slider">
                    </div>
                    
                    <div class="slider-container">
                        <div class="slider-label">Volume:</div>
                        <input type="range" min="0" max="100" value="50" class="slider" id="ad-volume-slider">
                    </div>
                    
                    <div style="margin-bottom: 16px;">
                        <div class="subsection-title">Voice</div>
                        <div class="button-group">
                            <button class="pill-button" data-voice="human">HUMAN</button>
                            <button class="pill-button" data-voice="synthesizer">SYNTHESIZER</button>
                        </div>
                    </div>
                    
                    <div style="margin-bottom: 16px;">
                        <div class="subsection-title">Gender</div>
                        <div class="button-group">
                            <button class="pill-button" data-gender="female">FEMALE</button>
                            <button class="pill-button" data-gender="male">MALE</button>
                            <button class="pill-button" data-gender="androgynous">ANDROGYNOUS</button>
                        </div>
                    </div>
                </div>
                
                <div class="divider"></div>
                
                <div class="section">
                    <div class="section-title">CUSTOMIZATION SETUPS</div>
                    
                    <div style="margin-bottom: 16px;">
                        <div class="subsection-title">Audio Description:</div>
                        <div class="button-group">
                            <button class="pill-button">ON</button>
                            <button class="pill-button">OFF</button>
                        </div>
                    </div>
                    
                    <div style="margin-bottom: 16px;">
                        <div class="subsection-title">Pause During AD:</div>
                        <div class="button-group">
                            <button class="pill-button">ON</button>
                            <button class="pill-button">OFF</button>
                        </div>
                    </div>
                </div>
                
                <div class="divider"></div>
                
                <div class="section">
                    <div class="section-title">CONTENT CUSTOMIZATION</div>
                    
                    <div class="slider-container">
                        <div class="slider-label">Length: <span id="length-value">50</span> words</div>
                        <input type="range" min="0" max="100" value="50" class="slider" id="length-slider">
                    </div>
                    
                    <div style="margin-bottom: 16px;">
                        <div class="subsection-title">Frequency:</div>
                        <div class="button-group">
                            <button class="pill-button">RARELY</button>
                            <button class="pill-button">SOMETIMES</button>
                            <button class="pill-button">OFTEN</button>
                            <button class="pill-button">VERY</button>
                        </div>
                    </div>
                    
                    <div style="margin-bottom: 16px;">
                        <div class="subsection-title">Emphasis (multiple choice):</div>
                        <div class="button-group">
                            <button class="pill-button">ACTIVITY</button>
                            <button class="pill-button">PERSON</button>
                            <button class="pill-button">OBJECT</button>
                            <button class="pill-button">SETTING</button>
                        </div>
                    </div>
                    
                    <div style="margin-bottom: 16px;">
                        <div class="subsection-title">Narration Style (multiple choice):</div>
                        <div class="button-group">
                            <button class="pill-button">STYLE 1</button>
                            <button class="pill-button">STYLE 2</button>
                            <button class="pill-button">STYLE 3</button>
                        </div>
                    </div>
                </div>
                
                <button class="save-button">SAVE CHANGES</button>
            </div>
            
            <div class="tab-content" id="vqa-tab" style="display: none;">
                <div class="section">
                    <div class="section-title">PRESENTATION CUSTOMIZATION</div>
                    
                    <div class="slider-container">
                        <div class="slider-label">Speed:</div>
                        <input type="range" min="0" max="100" value="50" class="slider" id="vqa-speed-slider">
                    </div>
                    
                    <div class="slider-container">
                        <div class="slider-label">Volume:</div>
                        <input type="range" min="0" max="100" value="50" class="slider" id="vqa-volume-slider">
                    </div>

                    <div style="margin-bottom: 16px;">
                        <div class="subsection-title">Voice</div>
                        <div class="button-group" id="vqa-voice-group">
                            <button class="pill-button" data-voice="human">HUMAN</button>
                            <button class="pill-button" data-voice="synthesizer">SYNTHESIZER</button>
                        </div>
                    </div>
                    
                    <div style="margin-bottom: 16px;">
                        <div class="subsection-title">Gender</div>
                        <div class="button-group" id="vqa-gender-group">
                            <button class="pill-button" data-gender="female">FEMALE</button>
                            <button class="pill-button" data-gender="male">MALE</button>
                            <button class="pill-button" data-gender="androgynous">ANDROGYNOUS</button>
                        </div>
                    </div>
                    
                </div>
                
                <div class="divider"></div>
                
                <button class="save-button">SAVE CHANGES</button>
            </div>
        `;
    };

    const newVideoLoaded = () => {
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
                sidebar.innerHTML = createSidebarContent();

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
