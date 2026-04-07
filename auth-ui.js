// Auth UI Handler - manages login/signup UI in sidebar

window.initAuthUI = function initAuthUI(sidebar) {
  const authAvatarBtn = sidebar.querySelector('#auth-avatar-btn');
  const authMenu = sidebar.querySelector('.auth-popup-menu');

  if (!authAvatarBtn) {
    console.error('Auth avatar button not found');
    return;
  }

  // Create auth menu if doesn't exist
  let menu = authMenu;
  if (!menu) {
    menu = document.createElement('div');
    menu.className = 'auth-popup-menu';
    menu.id = 'auth-popup-menu';
    sidebar.querySelector('.sidebar-header').appendChild(menu);
  }

  let menuOpen = false;

  // Toggle menu
  authAvatarBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    menuOpen = !menuOpen;
    if (menuOpen) {
      // Render fresh UI when opening
      updateAuthUI(sidebar);
      menu.style.display = 'block';
      console.log('Menu opened');
    } else {
      menu.style.display = 'none';
      console.log('Menu closed');
    }
  });

  // Close on outside click
  document.addEventListener('click', (e) => {
    if (menuOpen && !menu.contains(e.target) && e.target !== authAvatarBtn) {
      menuOpen = false;
      menu.style.display = 'none';
    }
  });

  // Render initial state
  updateAuthUI(sidebar);

  // Check auth state periodically
  setInterval(() => {
    const user = window.FirebaseAPI?.getCurrentUser();
    const wasLoggedIn = sidebar._wasLoggedIn;
    sidebar._wasLoggedIn = !!user;
    if (wasLoggedIn !== !!user) {
      location.reload();
    }
  }, 1000);
};

function updateAuthUI(sidebar) {
  const user = window.FirebaseAPI?.getCurrentUser();
  const menu = sidebar.querySelector('#auth-popup-menu') || sidebar.querySelector('.auth-popup-menu');
  
  if (!menu) {
    console.error('Auth menu element not found');
    return;
  }

  console.log('Rendering auth UI. User:', !!user);
  menu.innerHTML = '';

  if (user) {
    // Logged in view
    const content = document.createElement('div');
    content.className = 'auth-popup-content';
    content.innerHTML = `
      <div style="padding: 8px 0;">
        <div style="font-size: 14px; font-weight: 600;">${user.email}</div>
        <div style="font-size: 12px; color: #666;">${user.role || 'user'}</div>
      </div>
      <button id="logout-btn" style="width: 100%; padding: 8px; background: #e0e0e0; color: #000; border: none; border-radius: 4px; cursor: pointer; font-size: 14px;">Logout</button>
    `;
    menu.appendChild(content);

    content.querySelector('#logout-btn').addEventListener('click', async () => {
      await window.FirebaseAPI.logout();
      location.reload();
    });
  } else if (window.FirebaseAPI) {
    // Login/Signup view
    const content = document.createElement('div');
    content.className = 'auth-popup-content';
    content.innerHTML = `
      <div id="login-view">
        <div class="auth-popup-title">Login</div>
        <input type="email" id="login-email" class="auth-popup-input" placeholder="Email" />
        <input type="password" id="login-password" class="auth-popup-input" placeholder="Password" />
        <div id="login-error" style="color: #d32f2f; font-size: 12px; display: none;"></div>
        <button id="login-btn" class="auth-popup-button">Login</button>
        <button id="signup-switch" class="auth-popup-button auth-popup-secondary">Sign Up Instead</button>
      </div>
      <div id="signup-view" style="display: none;">
        <div class="auth-popup-title">Sign Up</div>
        <input type="email" id="signup-email" class="auth-popup-input" placeholder="Email" />
        <input type="password" id="signup-password" class="auth-popup-input" placeholder="Password" />
        <input type="password" id="signup-confirm" class="auth-popup-input" placeholder="Confirm Password" />
        <select id="signup-role" class="auth-popup-input">
          <option value="control_tester">Control Tester</option>
          <option value="experimental_tester">Experimental Tester</option>
        </select>
        <div id="signup-error" style="color: #d32f2f; font-size: 12px; display: none;"></div>
        <button id="signup-btn" class="auth-popup-button">Sign Up</button>
        <button id="login-switch" class="auth-popup-button auth-popup-secondary">Login Instead</button>
      </div>
    `;
    menu.appendChild(content);

    const loginView = content.querySelector('#login-view');
    const signupView = content.querySelector('#signup-view');

    // Login handlers
    content.querySelector('#login-btn').addEventListener('click', async () => {
      const email = content.querySelector('#login-email').value.trim();
      const password = content.querySelector('#login-password').value;
      const error = content.querySelector('#login-error');

      if (!email || !password) {
        error.textContent = 'Email and password required';
        error.style.display = 'block';
        return;
      }

      const result = await window.FirebaseAPI.loginWithEmail(email, password);
      if (result.success) {
        location.reload();
      } else {
        error.textContent = result.error || 'Login failed';
        error.style.display = 'block';
      }
    });

    // Signup handlers
    content.querySelector('#signup-btn').addEventListener('click', async () => {
      const email = content.querySelector('#signup-email').value.trim();
      const password = content.querySelector('#signup-password').value;
      const confirm = content.querySelector('#signup-confirm').value;
      const role = content.querySelector('#signup-role').value;
      const error = content.querySelector('#signup-error');

      if (!email || !password || !confirm) {
        error.textContent = 'All fields required';
        error.style.display = 'block';
        return;
      }

      if (password !== confirm) {
        error.textContent = 'Passwords do not match';
        error.style.display = 'block';
        return;
      }

      if (password.length < 6) {
        error.textContent = 'Password must be at least 6 characters';
        error.style.display = 'block';
        return;
      }

      const result = await window.FirebaseAPI.signupWithEmail(email, password, role);
      if (result.success) {
        location.reload();
      } else {
        error.textContent = result.error || 'Signup failed';
        error.style.display = 'block';
      }
    });

    // View switchers
    content.querySelector('#signup-switch').addEventListener('click', () => {
      loginView.style.display = 'none';
      signupView.style.display = 'block';
    });

    content.querySelector('#login-switch').addEventListener('click', () => {
      signupView.style.display = 'none';
      loginView.style.display = 'block';
    });
  } else {
    // Loading state
    const content = document.createElement('div');
    content.className = 'auth-popup-content';
    content.innerHTML = '<div style="text-align: center; padding: 16px;">Loading...</div>';
    menu.appendChild(content);
  }
}

window.getCurrentAuthState = function() {
  return window.FirebaseAPI?.getCurrentUser() ? 'logged-in' : 'guest';
};
