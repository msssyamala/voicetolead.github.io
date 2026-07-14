import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://gdyxyvhshltlshyfwdqd.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_lX69FPCqL6G0Yztxvn7U_g_KuOQySEb';

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

const authForm = document.querySelector('[data-auth-form]');
const authStatus = document.querySelector('[data-auth-status]');
const dashboardStatus = document.querySelector('[data-dashboard-status]');
const dashboardContent = document.querySelector('[data-dashboard-content]');
const userEmail = document.querySelector('[data-user-email]');
const signOutButton = document.querySelector('[data-sign-out]');

const setText = (element, message) => {
  if (element) {
    element.textContent = message;
  }
};

const getDashboardUrl = () => `${window.location.origin}/dashboard.html`;

const showAuthPage = async () => {
  if (!authForm) {
    return;
  }

  const { data } = await supabase.auth.getSession();

  if (data && data.session) {
    setText(authStatus, 'You are already signed in. Opening your dashboard...');
    window.setTimeout(() => {
      window.location.href = 'dashboard.html';
    }, 700);
  }
};

const showDashboard = async () => {
  if (!dashboardStatus) {
    return;
  }

  const { data, error } = await supabase.auth.getSession();

  if (error) {
    setText(dashboardStatus, `Could not check your account: ${error.message}`);
    return;
  }

  const session = data && data.session;

  if (!session) {
    setText(dashboardStatus, 'Please sign in to view your dashboard.');
    window.setTimeout(() => {
      window.location.href = 'auth.html';
    }, 900);
    return;
  }

  setText(dashboardStatus, 'You are signed in.');
  setText(userEmail, session.user.email || 'Signed-in user');

  if (dashboardContent) {
    dashboardContent.hidden = false;
  }
};

if (authForm) {
  authForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const formData = new FormData(authForm);
    const email = String(formData.get('email') || '').trim();

    if (!email) {
      setText(authStatus, 'Enter your email address first.');
      return;
    }

    setText(authStatus, 'Sending your secure sign-in link...');

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: getDashboardUrl(),
      },
    });

    if (error) {
      setText(authStatus, `Could not send sign-in link: ${error.message}`);
      return;
    }

    authForm.reset();
    setText(authStatus, 'Check your email for the VoiceToLead sign-in link.');
  });
}

if (signOutButton) {
  signOutButton.addEventListener('click', async () => {
    setText(dashboardStatus, 'Signing you out...');
    await supabase.auth.signOut();
    window.location.href = 'auth.html';
  });
}

showAuthPage();
showDashboard();
