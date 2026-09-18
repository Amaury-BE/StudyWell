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
const DROP_LIGHT_URL = 'https://raw.githubusercontent.com/Amaury-BE/StudyWell/main/Drop-Light.png';
const DROP_DARK_URL = 'https://raw.githubusercontent.com/Amaury-BE/StudyWell/main/Drop-Dark.png';
const CART_LIGHT_URL = 'https://raw.githubusercontent.com/Amaury-BE/StudyWell/main/Cart-Light.png';
const CART_DARK_URL = 'https://raw.githubusercontent.com/Amaury-BE/StudyWell/main/Cart-Dark.png';
const notificationElement = document.getElementById('notification');
const waterProgressElement = document.getElementById('waterProgress');

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
        .select('balance, total_study_seconds, study_objective_seconds')
        .eq('id', user.id)
        .single();

    if (error) {
        console.error('Could not load balance:', error);
        setBalance('–');
        return;
    }

    setBalance(data.balance);
    updateStudyTime(data.total_study_seconds || 0);
    updateWaterProgress(data.total_study_seconds || 0, data.study_objective_seconds);
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
    timerStatusElement.textContent = 'Collecting drops...';

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
            'The timer reached the 12-hour limit. All uncollected time was cancelled and no drops were awarded.',
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
        setBalance(data.balance);
    }

    if (data.total_study_seconds !== null &&
        data.total_study_seconds !== undefined) {
        updateStudyTime(data.total_study_seconds);
        await loadWaterObjective(data.total_study_seconds);
    }

    if (data.balance === null || data.balance === undefined) {
        await loadBalance();
    }

    showNotification(
        `${points} drop${points === 1 ? '' : 's'} collected.`,
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
            .or(`user_id.is.null,user_id.eq.${user.id}`)
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
    article.className = `shop-item${purchased ? ' purchased' : ''}`;
    const details = document.createElement('div');
    details.className = 'shop-item-details';
    const title = document.createElement('h3');
    title.textContent = item.name;
    const description = document.createElement('p');
    description.className = 'item-description';
    description.textContent = item.description ?? '';
    details.append(title, description);
    const content = document.createElement('div');
    content.className = 'shop-item-content';
    if (purchased) {
        content.classList.add('item-secret', 'item-secret-loading');
        content.textContent = 'Loading…';
        loadSecretInto(item.id, content);
    } else {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'unlock-button';
        button.setAttribute('aria-label', `Unlock ${item.name} for ${item.price} drops`);
        button.append(createDropIcon(), document.createTextNode(String(item.price)));
        button.addEventListener('click', async () => {
            button.disabled = true;
            const unlocked = await buyItem(item.id);
            if (!unlocked) button.disabled = false;
        });
        content.appendChild(button);
    }
    article.append(details, content);
    return article;
}
function createDropIcon() {
    const image = document.createElement('img');
    image.className = 'drop-icon theme-drop-icon';
    image.src = document.documentElement.dataset.theme === 'dark' ? DROP_DARK_URL : DROP_LIGHT_URL;
    image.alt = '';
    image.setAttribute('aria-hidden', 'true');
    return image;
}
async function buyItem(itemId) {
    const { error } = await supabase.rpc('buy_item', { p_item_id: itemId });
    if (error) {
        showNotification(error.message, 'error');
        return false;
    }
    await Promise.all([loadBalance(), loadShop()]);
    showNotification('Reward unlocked.', 'success');
    return true;
}
async function loadSecretInto(itemId, container) {
    const { data, error } = await supabase.rpc('get_secret', { p_item_id: itemId });
    container.classList.remove('item-secret-loading');
    container.replaceChildren();
    if (error) {
        container.textContent = 'The secret could not be loaded.';
        return;
    }
    renderSecret(container, data ?? 'No content is available.');
}
function renderSecret(container, value) {
    const text = String(value);
    const urlPattern = /https?:\/\/[^\s<]+/g;
    let cursor = 0;
    for (const match of text.matchAll(urlPattern)) {
        const index = match.index ?? 0;
        if (index > cursor) container.append(document.createTextNode(text.slice(cursor, index)));
        const link = document.createElement('a');
        link.href = match[0];
        link.textContent = match[0];
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        container.appendChild(link);
        cursor = index + match[0].length;
    }
    if (cursor < text.length) container.append(document.createTextNode(text.slice(cursor)));
}
function setBalance(value) {
    const valueElement = document.getElementById('balanceValue');
    if (valueElement) valueElement.textContent = String(value ?? 0);
}
function showNotification(message, type = 'success') {
    if (type !== 'error') {
        clearNotification();
        return;
    }
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

function updateStudyTime(totalSeconds) {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);

    document.getElementById('study-time').textContent =
        `${hours}h ${minutes}m`;
}

async function loadWaterObjective(totalStudySeconds) {
    const user = await getCurrentUser();
    if (!user) return;
    const { data, error } = await supabase
        .from('profiles')
        .select('study_objective_seconds')
        .eq('id', user.id)
        .single();
    if (error) {
        console.error('Could not load study objective:', error);
        updateWaterProgress(totalStudySeconds, null);
        return;
    }
    updateWaterProgress(totalStudySeconds, data.study_objective_seconds);
}

function updateWaterProgress(totalStudySeconds, objectiveSeconds) {
    if (!waterProgressElement) return;
    const objective = Number(objectiveSeconds);
    if (!Number.isFinite(objective) || objective <= 0) {
        waterProgressElement.hidden = true;
        waterProgressElement.style.removeProperty('--water-level');
        return;
    }
    const studied = Math.max(0, Number(totalStudySeconds) || 0);
    const percentage = Math.min(100, (studied / objective) * 100);
    waterProgressElement.hidden = false;
    waterProgressElement.style.setProperty('--water-level', `${percentage}%`);
}

// Theme switcher added for the redesigned interface.
const themeToggleButton = document.getElementById('themeToggle');
const savedTheme = localStorage.getItem('studywell-theme');
const preferredTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
applyTheme(savedTheme || preferredTheme);

themeToggleButton?.addEventListener('click', () => {
    const nextTheme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    applyTheme(nextTheme);
    localStorage.setItem('studywell-theme', nextTheme);
});

function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    updateThemeImages(theme);
    if (!themeToggleButton) return;
    const dark = theme === 'dark';
    themeToggleButton.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
    themeToggleButton.title = dark ? 'Switch to light mode' : 'Switch to dark mode';
}

function updateThemeImages(theme) {
    const dark = theme === 'dark';
    document.querySelectorAll('.theme-drop-icon').forEach(image => image.src = dark ? DROP_DARK_URL : DROP_LIGHT_URL);
    document.querySelectorAll('.theme-cart-icon').forEach(image => image.src = dark ? CART_DARK_URL : CART_LIGHT_URL);
}
