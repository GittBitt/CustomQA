(() => {
    const createSidebarContent = () => {
        return `
            <style>
                #custom-qa-sidebar * {
                    box-sizing: border-box;
                }
                
                #custom-qa-sidebar {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    color: #000;
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
                }
                
                .pill-button.active {
                    background: #000;
                    color: #fff;
                }
                
                .pill-button:not(.active) {
                    background: #e0e0e0;
                    color: #333;
                }
                
                .pill-button:hover:not(.active) {
                    background: #d0d0d0;
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
                        <span class="sidebar-title-main">Title</span>
                        <span class="sidebar-title-sub">Sidebar Plugin</span>
                    </div>
                </div>
                <div class="sidebar-header-actions">
                    <div class="vqa-badge">
                        VQA <span>❓</span>
                    </div>
                    <div class="settings-icon">⚙️</div>
                </div>
            </div>
            
            <div class="section">
                <div class="section-title">Presentation Customization</div>
                
                <div style="margin-bottom: 16px;">
                    <div class="subsection-title">Voice</div>
                    <div class="button-group">
                        <button class="pill-button">HUMAN</button>
                        <button class="pill-button active">SYNTHESIZER</button>
                    </div>
                </div>
                
                <div style="margin-bottom: 16px;">
                    <div class="subsection-title">Gender</div>
                    <div class="button-group">
                        <button class="pill-button">FEMALE</button>
                        <button class="pill-button active">MALE</button>
                        <button class="pill-button">ANDROGYNOUS</button>
                    </div>
                </div>
                
                <div class="slider-container">
                    <div class="slider-label">Speed:</div>
                    <input type="range" min="0" max="100" value="50" class="slider">
                </div>
                
                <div class="slider-container">
                    <div class="slider-label">Volume:</div>
                    <input type="range" min="0" max="100" value="50" class="slider">
                </div>
            </div>
            
            <div class="divider"></div>
            
            <div class="section">
                <div class="section-title">CUSTOMIZATION SETUPS</div>
                
                <div style="margin-bottom: 16px;">
                    <div class="subsection-title">Audio Description:</div>
                    <div class="button-group">
                        <button class="pill-button active">ON</button>
                        <button class="pill-button">OFF</button>
                    </div>
                </div>
                
                <div style="margin-bottom: 16px;">
                    <div class="subsection-title">Pause During AD:</div>
                    <div class="button-group">
                        <button class="pill-button">ON</button>
                        <button class="pill-button active">OFF</button>
                    </div>
                </div>
            </div>
            
            <div class="divider"></div>
            
            <div class="section">
                <div class="section-title">CONTENT CUSTOMIZATION</div>
                
                <div style="margin-bottom: 16px;">
                    <div class="subsection-title">Length:</div>
                    <div class="button-group">
                        <button class="pill-button">SUCCINCT</button>
                        <button class="pill-button active">VERBOSE</button>
                        <button class="pill-button">VERY VERBOSE</button>
                    </div>
                </div>
                
                <div style="margin-bottom: 16px;">
                    <div class="subsection-title">Frequency:</div>
                    <div class="button-group">
                        <button class="pill-button">RARELY</button>
                        <button class="pill-button active">SOMETIMES</button>
                        <button class="pill-button">OFTEN</button>
                        <button class="pill-button">VERY</button>
                    </div>
                </div>
                
                <div style="margin-bottom: 16px;">
                    <div class="subsection-title">Emphasis (multiple choice):</div>
                    <div class="button-group">
                        <button class="pill-button">ACTIVITY</button>
                        <button class="pill-button active">PERSON</button>
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
        `;
    };

    const newVideoLoaded = () => {
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

                secondary.prepend(sidebar);
                
                return true;
            }
        }
        return false;
    };

    const checkInterval = setInterval(() => {
        if (newVideoLoaded()) {
            clearInterval(checkInterval);
        }
    }, 1000);
})();