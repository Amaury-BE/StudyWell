import { createClient }
    from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
    'https://yrdsjrnqnfbryeazostu.supabase.co',
    'sb_publishable_K3loapGQUqwFG80SdFYEpQ_Fo02nzGR'
);


// =========================================================
// CONFIGURATION
// =========================================================

const MAX_TIMER_SECONDS =
    12 * 60 * 60;


// =========================================================
// PAGE ELEMENTS
// =========================================================

const loginSection =
    document.getElementById('login');

const appSection =
    document.getElementById('app');

const loginForm =
    document.getElementById('loginForm');

const emailInput =
    document.getElementById('email');

const passwordInput =
    document.getElementById('password');

const loginMessage =
    document.getElementById('loginMessage');

const logoutButton =
    document.getElementById('logoutButton');

const balanceElement =
    document.getElementById('balance');

const timerElement =
    document.getElementById('timer');

const timerStatusElement =
    document.getElementById('timerStatus');

const toggleTimerButton =
    document.getElementById('toggleTimerButton');

const resetTimerButton =
    document.getElementById('resetTimerButton');

const collectPointsButton =
    document.getElementById('collectPointsButton');

const shopElement =
    document.getElementById('shop');

const secretContentElement =
    document.getElementById('secretContent');

const notificationElement =
    document.getElementById('notification');


// =========================================================
// TIMER STATE
// =========================================================

let timerState =
    createEmptyTimerState();

let timerDisplayInterval = null;

let timerRequestInProgress = false;

let timerExpiryInProgress = false;


function createEmptyTimerState() {
    return {
        running: false,
        started_at: null,
        accumulated_seconds: 0
    };
}


function normaliseTimerState(data) {
    return {
        running:
            Boolean(data?.running),

        started_at:
            data?.started_at ?? null,

        accumulated_seconds:
            Math.max(
                0,
                Number(
                    data?.accumulated_seconds
                ) || 0
            )
    };
}


// =========================================================
// INITIALISATION
// =========================================================

document.addEventListener(
    'DOMContentLoaded',
    initialiseApplication
);


async function initialiseApplication() {
    registerEventListeners();

    const {
        data: { session },
        error
    } = await supabase.auth.getSession();

    if (error) {
        console.error(
            'Could not retrieve session:',
            error
        );
    }

    if (session) {
        await startApp();
    } else {
        showLogin();
    }
}


function registerEventListeners() {
    loginForm.addEventListener(
        'submit',
        login
    );

    logoutButton.addEventListener(
        'click',
        logout
    );

    toggleTimerButton.addEventListener(
        'click',
        toggleTimer
    );

    resetTimerButton.addEventListener(
        'click',
        requestTimerReset
    );

    collectPointsButton.addEventListener(
        'click',
        collectPoints
    );
}


supabase.auth.onAuthStateChange(
    (event, session) => {
        if (
            event === 'SIGNED_OUT' ||
            !session
        ) {
            stopTimerDisplay();
            showLogin();
        }
    }
);


// =========================================================
// LOGIN
// =========================================================

async function login(event) {
    event.preventDefault();

    clearNotification();
    setLoginMessage('');

    const email =
        emailInput.value.trim();

    const password =
        passwordInput.value;

    if (!email || !password) {
        setLoginMessage(
            'Enter your email address and password.',
            true
        );

        return;
    }

    const loginButton =
        loginForm.querySelector(
            'button[type="submit"]'
        );

    setButtonLoading(
        loginButton,
        true,
        'Logging in...'
    );

    const { error } =
        await supabase.auth.signInWithPassword({
            email,
            password
        });

    setButtonLoading(
        loginButton,
        false,
        'Log in'
    );

    if (error) {
        setLoginMessage(
            error.message,
            true
        );

        return;
    }

    passwordInput.value = '';

    await startApp();
}


function setLoginMessage(
    message,
    isError = false
) {
    loginMessage