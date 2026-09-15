import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
    'https://yrdsjrnqnfbryeazostu.supabase.co',
    'sb_publishable_K3loapGQUqwFG80SdFYEpQ_Fo02nzGR'
);

const MAX_TIMER_SECONDS = 12 * 60 * 60;

const loginSection = document.getElementById('login');
const appSection = document.getElementById('app');
const loginForm = document.getElementById('loginForm');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const loginMessage = document.getElementById('loginMessage');
const logoutButton = document.getElementById('logoutButton');
const balanceElement = document.getElementById('balance');
const timerElement = document.getElementById('timer');
const timerStatusElement = document.getElementById('timerStatus');
const toggleTimerButton = document.getElementById('toggleTimerButton');
const resetTimerButton = document.getElementById('resetTimerButton');
const collectPointsButton = document.getElementById('collectPointsButton');
const shopElement = document.getElementById('shop');
const secretContentElement = document.getElementById('secretContent');
const notificationElement = document.getElementById('notification');

let timerState = createEmptyTimerState();
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
        running: Boolean(data?.running),
        started_at: data?.started_at ?? null,
        accumulated_seconds: Math.max(0, Number(data?.accumulated_seconds) || 0)
    };
}

document.addEventListener('DOMContentLoaded', initialiseApplication);

async function initialiseApplication() {
    registerEventListeners();

    const {
        data: { session },
        error
    } = await supabase.auth.getSession();

    if (error) {
        console.error('Could not retrieve session:', error);
    }

    if (session) {
        await startApp();
    } else {
        showLogin();
    }
}

function registerEventListeners() {
    loginForm.addEventListener('submit', login);
    logoutButton.addEventListener('click', logout);
    toggleTimerButton.addEventListener('click', toggleTimer);
    resetTimerButton.addEventListener('click', requestTimerReset);
    collectPointsButton.addEventListener('click', collectPoints);
}

supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT' || !session) {
        stopTimerDisplay();
        showLogin();
    }
});

async function login(event) {
    event.preventDefault();
    clearNotification();
    setLoginMessage('');

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email || !password) {
        setLoginMessage('Enter your email address and password.', true);
        return;
    }

    const loginButton = loginForm.querySelector('button[type="submit"]');
    setButtonLoading(loginButton, true, 'Logging in...');

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    setButtonLoading(loginButton, false, 'Log in');

    if (error) {
        setLoginMessage(error.message, true);
        return;
    }

    passwordInput.value = '';
    await startApp();
}

function setLoginMessage(message, isError = false) {
    loginMessage.textContent = message;
    loginMessage.classList.toggle('error-message', isError);
}

async function logout() {
    stopTimerDisplay();
    const { error } = await supabase.auth.signOut();

    if (error) {
        showNotification(error.message, 'error');
        return;
    }

    showLogin();
}

async function startApp() {
    loginSection.hidden = true;
    appSection.hidden = false;
    clearNotification();

    await Promise.all([loadBalance(), loadShop()]);
    await loadTimer();
}

function showLogin() {
    loginSection.hidden = false;
    appSection.hidden = true;
    timerState = createEmptyTimerState();
    stopTimerDisplay();
    renderTimer();
}

async function getCurrentUser() {
    const {
        data: { user },
        error
    } = await supabase.auth.getUser();

    if (error || !user) {
        stopTimerDisplay();
        showLogin();
        return null;
    }

    return user;
}

async function loadBalance() {
    const user = await getCurrentUser();
    if (!user) return;

    const { data, error } = await supabase
        .from('profiles')
        .select('balance')
        .eq('id', user.id)
        .single();

    if (error) {
        console.error('Could not load balance:', error);
        balanceElement.textContent = 'Balance unavailable';
        return;
    }

    balanceElement.textContent = `${data.balance} coins`;
}

async function loadTimer(showExpiryMessage = true) {
    const { data, error } = await supabase.rpc('get_study_timer');

    if (error) {
        console.error('Could not load timer:', error);
        timerStatusElement.textContent = 'Timer unavailable';
        showNotification(error.message, 'error');
        return;
    }

    timerState = normaliseTimerState(data);
    configureTimerDisplay();
    renderTimer();

    if (data?.expired && showExpiryMessage) {
        showNotification(
            'The timer reached the 12-hour limit. All uncollected timer time was cancelled.',
            'warning'
        );
    }
}

async function toggleTimer() {
    if (timerRequestInProgress) return;

    if (timerState.running) {
        await pauseTimer();
    } else {
        await startTimer();
    }
}

async function startTimer() {
    setTimerControlsBusy(true);
    timerStatusElement.textContent =
        timerState.accumulated_seconds > 0 ? 'Resuming timer...' : 'Starting timer...';

    const { data, error } = await supabase.rpc('start_study_timer');

    if (error) {
        setTimerControlsBusy(false);
        showNotification(error.message, 'error');
        await loadTimer(false);
        return;
    }

    timerState = normaliseTimerState(data);
    configureTimerDisplay();
    setTimerControlsBusy(false);
    renderTimer();

    if (data?.expired) {
        showNotification(
            'The previous timer exceeded 12 hours and was cancelled. A new timer has started.',
            'warning'
        );
    } else {
        showNotification(
            timerState.accumulated_seconds > 0 ? 'Study timer resumed.' : 'Study timer started.',
            'success'
        );
    }
}

async function pauseTimer() {
    if (!timerState.running) return;

    setTimerControlsBusy(true);
    timerStatusElement.textContent = 'Pausing timer...';

    const { data, error } = await supabase.rpc('pause_study_timer');

    if (error) {
        setTimerControlsBusy(false);
        showNotification(error.message, 'error');
        await loadTimer(false);
        return;
    }

    timerState = normaliseTimerState(data);
    configureTimerDisplay();
    setTimerControlsBusy(false);
    renderTimer();

    if (data?.expired) {
        showNotification(
            'The timer reached the 12-hour limit. All uncollected timer time was cancelled.',
            'warning'
        );
    } else {
        showNotification('Study timer paused.', 'success');
    }
}

function requestTimerReset() {
    if (getDisplayedSeconds() === 0) return;

    const confirmed = window.confirm(
        'Reset the timer? All uncollected study time will be lost.'
    );

    if (confirmed) resetTimer();
}

async function resetTimer(showSuccessMessage = true) {
    setTimerControlsBusy(true);
    const { data, error } = await supabase.rpc('reset_study_timer');

    if (error) {
        setTimerControlsBusy(false);
        showNotification(error.message, 'error');
        return false;
    }

    timerState = normaliseTimerState(data);
    configureTimerDisplay();
    setTimerControlsBusy(false);
    renderTimer();

    if (showSuccessMessage) {
        showNotification('Study timer reset.', 'success');
    }

    return true;
}

async function collectPoints() {
    if (timerRequestInProgress) return;

    if (getDisplayedSeconds() < 60) {
        showNotification(
            'Study for at least one complete minute before collecting.',
            'warning'
        );
        return;
    }

    setTimerControlsBusy(true);
    timerStatusElement.textContent = 'Collecting coins...';

    const { data, error } = await supabase.rpc('collect_study_points');

    if (error) {
        setTimerControlsBusy(false);
        showNotification(error.message, 'error');
        await loadTimer(false);
        return;
    }

    timerState = normaliseTimerState(data);
    configureTimerDisplay();
    setTimerControlsBusy(false);
    renderTimer();

    if (data?.expired) {
        showNotification(
            'The timer reached the 12-hour limit. All uncollected time was cancelled and no coins were awarded.',
            'warning'
        );
        return;
    }

    if (!data?.collected) {
        showNotification(
            'Study for at least one complete minute before collecting.',
            'warning'
        );
        return;
    }

    const points = Number(data.points) || 0;

    if (data.balance !== null && data.balance !== undefined) {
        balanceElement.textContent = `${data.balance} coins`;
    } else {
        await loadBalance();
    }

    showNotification(
        `${points} coin${points === 1 ? '' : 's'} collected.`,
        'success'
    );
}

function configureTimerDisplay() {
    stopTimerDisplay();
    renderTimer();
    timerDisplayInterval = window.setInterval(updateTimerDisplay, 1000);
}

function stopTimerDisplay() {
    if (timerDisplayInterval !== null) {
        window.clearInterval(timerDisplayInterval);
        timerDisplayInterval = null;
    }
}

function updateTimerDisplay() {
    const totalSeconds = getDisplayedSeconds();

    if (totalSeconds >= MAX_TIMER_SECONDS && !timerExpiryInProgress) {
        handleLocalTimerExpiry();
        return;
    }

    renderTimer();
}

async function handleLocalTimerExpiry() {
    timerExpiryInProgress = true;
    stopTimerDisplay();
    await loadTimer(false);
    timerExpiryInProgress = false;

    showNotification(
        'The timer reached the 12-hour limit. All uncollected timer time was cancelled.',
        'warning'
    );
}

function getDisplayedSeconds() {
    const accumulatedSeconds = Math.max(
        0,
        Number(timerState.accumulated_seconds) || 0
    );

    if (!timerState.running || !timerState.started_at) {
        return accumulatedSeconds;
    }

    const startedAt = new Date(timerState.started_at).getTime();
    if (!Number.isFinite(startedAt)) return accumulatedSeconds;

    const runningSeconds = Math.max(
        0,
        Math.floor((Date.now() - startedAt) / 1000)
    );

    return accumulatedSeconds + runningSeconds;
}

function renderTimer() {
    const totalSeconds = Math.min(getDisplayedSeconds(), MAX_TIMER_SECONDS);
    timerElement.textContent = formatDuration(totalSeconds);

    if (timerState.running) {
        timerStatusElement.textContent = 'Study session running';
        toggleTimerButton.textContent = 'Pause';
    } else if (totalSeconds > 0) {
        timerStatusElement.textContent = 'Study session paused';
        toggleTimerButton.textContent = 'Resume';
    } else {
        timerStatusElement.textContent = 'Ready to study';
        toggleTimerButton.textContent = 'Start';
    }

    if (!timerRequestInProgress) {
        toggleTimerButton.disabled = false;
        resetTimerButton.disabled = totalSeconds === 0;
        collectPointsButton.disabled = totalSeconds < 60;
    }
}

function formatDuration(totalSeconds) {
    const safeSeconds = Math.max(0, Math.floor(totalSeconds));
    const hours = Math.floor(safeSeconds / 3600);
    const minutes = Math.floor((safeSeconds % 3600) / 60);
    const seconds = safeSeconds % 60;

    return [hours, minutes, seconds]
        .map(value => String(value).padStart(2, '0'))
        .join(':');
}

function setTimerControlsBusy(busy) {
    timerRequestInProgress = busy;

    if (busy) {
        toggleTimerButton.disabled = true;
        resetTimerButton.disabled = true;
        collectPointsButton.disabled = true;
    } else {
        renderTimer();
    }
}

async function loadShop() {
    shopElement.replaceChildren();
    const user = await getCurrentUser();
    if (!user) return;

    const [itemsResult, purchasesResult] = await Promise.all([
        supabase
            .from('shop_items')
            .select('id, name, description, price')
            .eq('active', true)
            .order('price'),
        supabase
            .from('purchases')
            .select('item_id')
            .eq('user_id', user.id)
    ]);

    if (itemsResult.error) {
        console.error('Could not load shop:', itemsResult.error);
        shopElement.textContent = 'The shop could not be loaded.';
        return;
    }

    if (purchasesResult.error) {
        console.error('Could not load purchases:', purchasesResult.error);
        shopElement.textContent = 'Your purchases could not be loaded.';
        return;
    }

    const purchasedIds = new Set(
        (purchasesResult.data ?? []).map(purchase => purchase.item_id)
    );

    const items = itemsResult.data ?? [];

    if (items.length === 0) {
        shopElement.textContent = 'No rewards are currently available.';
        return;
    }

    for (const item of items) {
        shopElement.appendChild(createShopItem(item, purchasedIds.has(item.id)));
    }
}

function createShopItem(item, purchased) {
    const article = document.createElement('article');
    article.className = 'shop-item';

    const details = document.createElement('div');
    details.className = 'shop-item-details';

    const title = document.createElement('h3');
    title.textContent = item.name;

    const description = document.createElement('p');
    description.className = 'item-description';
    description.textContent = item.description ?? '';

    const price = document.createElement('p');
    price.className = 'item-price';
    price.textContent = `${item.price} coins`;

    details.append(title, description, price);

    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = purchased ? 'View' : 'Unlock';

    if (purchased) button.classList.add('secondary-button');

    button.addEventListener('click', async () => {
        button.disabled = true;

        if (purchased) {
            await viewSecret(item.id);
        } else {
            await buyItem(item.id);
        }

        button.disabled = false;
    });

    article.append(details, button);
    return article;
}

async function buyItem(itemId) {
    const { data, error } = await supabase.rpc('buy_item', {
        p_item_id: itemId
    });

    if (error) {
        showNotification(error.message, 'error');
        return;
    }

    secretContentElement.textContent = data ?? 'No content is available.';
    await Promise.all([loadBalance(), loadShop()]);
    showNotification('Reward unlocked.', 'success');
}

async function viewSecret(itemId) {
    const { data, error } = await supabase.rpc('get_secret', {
        p_item_id: itemId
    });

    if (error) {
        showNotification(error.message, 'error');
        return;
    }

    secretContentElement.textContent = data ?? 'No content is available.';
}

function showNotification(message, type = 'success') {
    notificationElement.textContent = message;
    notificationElement.className = `notification notification-${type}`;
    notificationElement.hidden = false;
}

function clearNotification() {
    notificationElement.textContent = '';
    notificationElement.className = 'notification';
    notificationElement.hidden = true;
}

function setButtonLoading(button, loading, label) {
    button.disabled = loading;
    button.textContent = label;
}
