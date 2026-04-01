// Auth UI Handler - manages login/signup UI in sidebar
let authMenuOpen = false;

window.initAuthUI = function initAuthUI(sidebar) {
  const authAvatarBtn = sidebar.querySelector('#auth-avatar-btn');
  const authMenu = sidebar.querySelector('#auth-menu');
  const loginForm = sidebar.querySelector('#login-form');
  const signupForm = sidebar.querySelector('#signup-form');
  const loggedInForm = sidebar.querySelector('#logged-in-form');

  if (!authAvatarBtn || !authMenu) {
    console.error('Auth elements not found');
    return;
  }

  console.log('Auth UI initialized');

  // Toggle auth menu
  authAvatarBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    authMenuOpen = !authMenuOpen;
    authMenu.style.display = authMenuOpen ? 'block' : 'none';
    console.log('Menu toggled:', authMenuOpen);
  });

  // Close menu on outside click
  document.addEventListener('click', (e) => {
    if (authMenuOpen && !authMenu.contains(e.target) && e.target !== authAvatarBtn) {
      authMenuOpen = false;
      authMenu.style.display = 'none';
    }
  });

  // Login button
  const loginEmailInput = sidebar.querySelector('#login-email');
  const loginPasswordInput = sidebar.querySelector('#login-password');
  const loginBtn = sidebar.querySelector('#login-btn');
  const loginError = sidebar.querySelector('#login-error');
  const signupSwitchBtn = sidebar.querySelector('#signup-switch-btn');

  loginBtn.addEventListener('click', async () => {
    const email = loginEmailInput.value.trim();
    const password = loginPasswordInput.value;

    if (!email || !password) {
      loginError.textContent = 'Email and password required';
      loginError.style.display = 'block';
      return;
    }

    loginBtn.disabled = true;
    loginBtn.textContent = 'Logging in...';
    loginError.style.display = 'none';

    const result = await window.FirebaseAPI.loginWithEmail(email, password);
    
    loginBtn.disabled = false;
    loginBtn.textContent = 'Login';

    if (result.success) {
      loginEmailInput.value = '';
      loginPasswordInput.value = '';
      updateAuthUI('logged-in', result.user, sidebar);
    } else {
      loginError.textContent = result.error || 'Login failed';
      loginError.style.display = 'block';
    }
  });

  signupSwitchBtn.addEventListener('click', () => {
    loginForm.style.display = 'none';
    signupForm.style.display = 'flex';
    loginError.style.display = 'none';
  });

  // Signup button
  const signupEmailInput = sidebar.querySelector('#signup-email');
  const signupPasswordInput = sidebar.querySelector('#signup-password');
  const signupConfirmInput = sidebar.querySelector('#signup-confirm');
  const signupRoleInput = sidebar.querySelector('#signup-role');
  const signupBtn = sidebar.querySelector('#signup-btn');
  const signupError = sidebar.querySelector('#signup-error');
  const loginSwitchBtn = sidebar.querySelector('#login-switch-btn');

  signupBtn.addEventListener('click', async () => {
    const email = signupEmailInput.value.trim();
    const password = signupPasswordInput.value;
    const confirm = signupConfirmInput.value;
    const role = signupRoleInput.value;

    if (!email || !password || !confirm) {
      signupError.textContent = 'All fields required';
      signupError.style.display = 'block';
      return;
    }

    if (password !== confirm) {
      signupError.textContent = 'Passwords do not match';
      signupError.style.display = 'block';
      return;
    }

    if (password.length < 6) {
      signupError.textContent = 'Password must be at least 6 characters';
      signupError.style.display = 'block';
      return;
    }

    signupBtn.disabled = true;
    signupBtn.textContent = 'Creating account...';
    signupError.style.display = 'none';

    const result = await window.FirebaseAPI.signupWithEmail(email, password, role);

    signupBtn.disabled = false;
    signupBtn.textContent = 'Sign Up';

    if (result.success) {
      signupEmailInput.value = '';
      signupPasswordInput.value = '';
      signupConfirmInput.value = '';
      updateAuthUI('logged-in', result.user, sidebar);
    } else {
      signupError.textContent = result.error || 'Signup failed';
      signupError.style.display = 'block';
    }
  });

  loginSwitchBtn.addEventListener('click', () => {
    signupForm.style.display = 'none';
    loginForm.style.display = 'flex';
    signupError.style.display = 'none';
  });

  // Logout button
  const logoutBtn = sidebar.querySelector('#logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      await window.FirebaseAPI.logout();
      updateAuthUI('guest', null, sidebar);
    });
  }

  // Check current auth state
  const user = window.FirebaseAPI?.getCurrentUser();
  if (user) {
    updateAuthUI('logged-in', user, sidebar);
  }
};

function updateAuthUI(state, user, sidebar) {
  const loginForm = sidebar.querySelector('#login-form');
  const signupForm = sidebar.querySelector('#signup-form');
  const loggedInForm = sidebar.querySelector('#logged-in-form');

  if (state === 'logged-in' && user) {
    loginForm.style.display = 'none';
    signupForm.style.display = 'none';
    loggedInForm.style.display = 'flex';

    const userEmailDisplay = sidebar.querySelector('#user-email-display');
    const userRoleDisplay = sidebar.querySelector('#user-role-display');
    userEmailDisplay.textContent = user.email;
    userRoleDisplay.textContent = `Role: ${user.role || 'user'}`;
  } else {
    loginForm.style.display = 'flex';
    signupForm.style.display = 'none';
    loggedInForm.style.display = 'none';
  }
}

window.getCurrentAuthState = function() {
  return window.FirebaseAPI?.getCurrentUser() ? 'logged-in' : 'guest';
};
