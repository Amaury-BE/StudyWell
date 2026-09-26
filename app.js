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
const levelNameElement = document.getElementById('levelName');
const levelProgressElement = document.getElementById('levelProgress');
const levelProgressFillElement = document.getElementById('levelProgressFill');
const levelProgressTextElement = document.getElementById('levelProgressText');
const streakDisplayElement = document.getElementById('streakDisplay');

const badgesElement = document.getElementById('badges');
const badgeCountElement = document.getElementById('badgeCount');

const weekViewButton = document.getElementById('weekViewButton');
const monthViewButton = document.getElementById('monthViewButton');
const previousPeriodButton = document.getElementById('previousPeriodButton');
const nextPeriodButton = document.getElementById('nextPeriodButton');

const statisticsPeriodLabelElement =
  document.getElementById('statisticsPeriodLabel');

const statisticsTotalElement =
  document.getElementById('statisticsTotal');

const statisticsCalendarAverageElement =
  document.getElementById('statisticsCalendarAverage');

const statisticsActiveAverageElement =
  document.getElementById('statisticsActiveAverage');

const statisticsChartElement =
  document.getElementById('statisticsChart');

const statisticsAccessibleSummaryElement =
  document.getElementById('statisticsAccessibleSummary');

let timerState = createEmptyTimerState();
let timerDisplayInterval = null;
let timerRequestInProgress = false;
let timerExpiryInProgress = false;

const INDIA_TIME_ZONE = 'Asia/Kolkata';

let statisticsView = 'week';
let statisticsAnchorDate = getIndiaToday();

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

  weekViewButton?.addEventListener('click', () => {
    setStatisticsView('week');
  });

  monthViewButton?.addEventListener('click', () => {
    setStatisticsView('month');
  });

  previousPeriodButton?.addEventListener('click', () => {
    moveStatisticsPeriod(-1);
  });

  nextPeriodButton?.addEventListener('click', () => {
    moveStatisticsPeriod(1);
  });
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

  statisticsView = 'week';
  statisticsAnchorDate = getIndiaToday();
  updateStatisticsViewButtons();
  
  await updateTimezone();
    
  await Promise.all([
    loadPlayerProgress(),
    loadShop(),
    loadBadges(),
    loadStatistics()
  ]);

  await loadTimer();
}

function showLogin() {
    loginSection.hidden = false;
    appSection.hidden = true;
    timerState = createEmptyTimerState();
    stopTimerDisplay();
    renderTimer();
    if (badgesElement) {
      badgesElement.replaceChildren();
    }

    if (statisticsChartElement) {
      statisticsChartElement.replaceChildren();
    }

    if (streakDisplayElement) {
      streakDisplayElement.hidden = true;
    }
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

async function loadPlayerProgress() {
  const user = await getCurrentUser();
  if (!user) return;

  const [profileResult, levelsResult] = await Promise.all([
    supabase
      .from('profiles')
      .select(`
        balance,
        total_study_seconds,
        study_objective_seconds,
        consecutive_qualified_days,
        longest_streak,
        last_qualified_study_date,
        total_qualified_days,
        streaks_started,
        total_drops_earned
      `)
      .eq('id', user.id)
      .single(),

    supabase
      .from('levels')
      .select('level, name, min_study_seconds')
      .order('min_study_seconds', { ascending: true })
  ]);

  if (profileResult.error) {
    console.error(
      'Could not load player progress:',
      profileResult.error
    );

    setBalance('–');
    return;
  }

  if (levelsResult.error) {
    console.error(
      'Could not load levels:',
      levelsResult.error
    );
  }

  const profile = profileResult.data;
  const levels = levelsResult.data ?? [];
  const totalSeconds = Number(profile.total_study_seconds) || 0;

  setBalance(profile.balance);
  updateStudyTime(totalSeconds);

  updateWaterProgress(
    totalSeconds,
    profile.study_objective_seconds
  );

  renderLevel(totalSeconds, levels);

  renderStreak(
    Number(profile.consecutive_qualified_days) || 0,
    profile.last_qualified_study_date
  );
}

/*
 * Preserve the old function name because other parts of the application
 * call loadBalance after a purchase.
 */
async function loadBalance() {
  await loadPlayerProgress();
}

function renderLevel(totalStudySeconds, levels) {
  if (!levelNameElement) return;

  if (!Array.isArray(levels) || levels.length === 0) {
    levelNameElement.textContent = 'Level unavailable';
    levelProgressTextElement.textContent = '';
    levelProgressFillElement.style.width = '0%';
    return;
  }

  let currentLevel = levels[0];
  let nextLevel = null;

  for (let index = 0; index < levels.length; index += 1) {
    const level = levels[index];

    if (Number(level.min_study_seconds) <= totalStudySeconds) {
      currentLevel = level;
      nextLevel = levels[index + 1] ?? null;
    }
  }

  levelNameElement.textContent =
    `Level ${currentLevel.level}: ${currentLevel.name}`;

  if (!nextLevel) {
    levelProgressFillElement.style.width = '100%';
    levelProgressTextElement.textContent = 'Maximum level reached';

    levelProgressElement.setAttribute('aria-valuenow', '100');
    return;
  }

  const currentMinimum =
    Number(currentLevel.min_study_seconds) || 0;

  const nextMinimum =
    Number(nextLevel.min_study_seconds) || currentMinimum;

  const levelRange =
    Math.max(1, nextMinimum - currentMinimum);

  const progress =
    Math.max(0, totalStudySeconds - currentMinimum);

  const percentage =
    Math.min(100, (progress / levelRange) * 100);

  const remaining =
    Math.max(0, nextMinimum - totalStudySeconds);

  levelProgressFillElement.style.width = `${percentage}%`;

  levelProgressTextElement.textContent =
    `${formatStudyTime(remaining)} to Level ${nextLevel.level}`;

  levelProgressElement.setAttribute(
    'aria-valuenow',
    String(Math.round(percentage))
  );
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

function renderStreak(streak, lastQualifiedDate) {
  if (!streakDisplayElement) return;

  const visibleStreak =
    getVisibleStreak(streak, lastQualifiedDate);

  if (visibleStreak < 2) {
    streakDisplayElement.hidden = true;
    streakDisplayElement.textContent = '';
    streakDisplayElement.className = 'streak-display';
    return;
  }

  const colourClass =
    `streak-${Math.min(visibleStreak, 10)}`;

  streakDisplayElement.hidden = false;
  streakDisplayElement.className =
    `streak-display ${colourClass}`;

  streakDisplayElement.textContent =
    `x${visibleStreak} streak`;
}

function getVisibleStreak(streak, lastQualifiedDate) {
  if (streak < 2 || !lastQualifiedDate) return 0;

  const today = getIndiaToday();
  const yesterday = addDays(today, -1);

  if (
    lastQualifiedDate === formatIsoDate(today) ||
    lastQualifiedDate === formatIsoDate(yesterday)
  ) {
    return streak;
  }

  return 0;
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
    const streakBonus = Number(data.streak_bonus) || 0;

    if (
      data.balance !== null &&
      data.balance !== undefined
    ) {
      setBalance(data.balance);
    }

    if (
      data.total_study_seconds !== null &&
      data.total_study_seconds !== undefined
    ) {
      updateStudyTime(data.total_study_seconds);
      await loadWaterObjective(data.total_study_seconds);
    }

    await Promise.all([
      loadPlayerProgress(),
      loadBadges(),
      loadStatistics()
    ]);

    const newlyAwardedBadges =
      Array.isArray(data.new_badges)
        ? data.new_badges
        : [];

    const notificationParts = [
      `${points} study drop${points === 1 ? '' : 's'} collected`
    ];

    if (streakBonus > 0) {
      notificationParts.push(
        `${streakBonus} streak bonus drops`
      );
    }

    if (newlyAwardedBadges.length > 0) {
      const badgeNames = newlyAwardedBadges
        .map(badge => badge.name)
        .filter(Boolean)
        .join(', ');

      notificationParts.push(
        `new badge${newlyAwardedBadges.length === 1 ? '' : 's'}: ${badgeNames}`
      );
    }

    showNotification(
      `${notificationParts.join('. ')}.`,
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
    await Promise.all([
      loadPlayerProgress(),
      loadShop(),
      loadBadges()
    ]);
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

async function loadBadges() {
  if (!badgesElement || !badgeCountElement) return;

  const user = await getCurrentUser();
  if (!user) return;

  badgesElement.innerHTML =
    '<p class="empty-state">Loading badges…</p>';

  const [badgesResult, earnedResult, profileResult, purchasesResult] =
    await Promise.all([
      supabase
        .from('badges')
        .select(`
          id,
          name,
          description,
          image_url,
          measure,
          target_value,
          sort_order
        `)
        .eq('active', true)
        .or(`user_id.is.null,user_id.eq.${user.id}`)
        .order('sort_order')
        .order('id'),

      supabase
        .from('user_badges')
        .select('badge_id, awarded_at')
        .eq('user_id', user.id),

      supabase
        .from('profiles')
        .select(`
          balance,
          total_study_seconds,
          consecutive_qualified_days,
          longest_streak,
          total_qualified_days,
          streaks_started,
          total_drops_earned
        `)
        .eq('id', user.id)
        .single(),

      supabase
        .from('purchases')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
    ]);

  if (
    badgesResult.error ||
    earnedResult.error ||
    profileResult.error ||
    purchasesResult.error
  ) {
    console.error('Could not load badges:', {
      badges: badgesResult.error,
      earned: earnedResult.error,
      profile: profileResult.error,
      purchases: purchasesResult.error
    });

    badgesElement.innerHTML =
      '<p class="empty-state">Badges could not be loaded.</p>';

    return;
  }

  const badges = badgesResult.data ?? [];
  const awardedIds = new Set(
    (earnedResult.data ?? []).map(row => row.badge_id)
  );

  const profile = profileResult.data;
  const purchaseCount = Number(purchasesResult.count) || 0;

  const measures = {
    balance: 
      Number(profile.balance) || 0,
      
    total_study_seconds:
      Number(profile.total_study_seconds) || 0,

    current_streak:
      Number(profile.consecutive_qualified_days) || 0,

    longest_streak:
      Number(profile.longest_streak) || 0,

    total_qualified_days:
      Number(profile.total_qualified_days) || 0,

    streaks_started:
      Number(profile.streaks_started) || 0,

    items_purchased:
      purchaseCount,

    total_drops_earned:
      Number(profile.total_drops_earned) || 0
  };

  badgesElement.replaceChildren();

  if (badges.length === 0) {
    badgesElement.innerHTML =
      '<p class="empty-state">No badges are currently available.</p>';

    badgeCountElement.textContent = '0 / 0';
    return;
  }

  let earnedCount = 0;

  for (const badge of badges) {
    const earned = awardedIds.has(badge.id);

    if (earned) earnedCount += 1;

    const currentValue =
      Number(measures[badge.measure]) || 0;

    badgesElement.appendChild(
      createBadgeElement(
        badge,
        earned,
        currentValue
      )
    );
  }

  badgeCountElement.textContent =
    `${earnedCount} / ${badges.length}`;
}

function createBadgeElement(
  badge,
  earned,
  currentValue
) {
  const article = document.createElement('article');

  article.className =
    `badge ${earned ? 'badge-earned' : 'badge-locked'}`;

  const image = document.createElement('img');
  image.className = 'badge-image';
  image.src = badge.image_url;
  image.alt = '';

  image.addEventListener('error', () => {
    console.error(
        'Badge image failed',
        badge.name,
        badge.image_url
    );
    image.style.border = '3px solid red';
  });

  const title = document.createElement('h3');
  title.textContent = badge.name;

  const description = document.createElement('p');
  description.className = 'badge-description';
  description.textContent = badge.description;

  const targetValue = Number(badge.target_value) || 1;
  const percentage = earned
    ? 100
    : Math.min(100, (currentValue / targetValue) * 100);

  const progress = document.createElement('div');
  progress.className = 'badge-progress';

  const progressFill = document.createElement('span');
  progressFill.style.width = `${percentage}%`;

  progress.appendChild(progressFill);

  const progressText = document.createElement('span');
  progressText.className = 'badge-progress-text';

  progressText.textContent =
    getBadgeProgressText(
      badge.measure,
      currentValue,
      targetValue,
      earned
    );

  article.append(
    image,
    title,
    description,
    progress,
    progressText
  );

  return article;
}

function getBadgeProgressText(
  measure,
  currentValue,
  targetValue,
  earned
) {
  if (earned) return 'Completed';

  if (measure === 'total_study_seconds') {
    return `${formatStudyTime(currentValue)} / ${formatStudyTime(targetValue)}`;
  }

  if (measure === 'total_drops_earned') {
    return `${currentValue.toLocaleString()} / ${targetValue.toLocaleString()} drops`;
  }

  return `${currentValue.toLocaleString()} / ${targetValue.toLocaleString()}`;
}

function setStatisticsView(view) {
  if (view !== 'week' && view !== 'month') return;

  statisticsView = view;
  statisticsAnchorDate = getIndiaToday();

  updateStatisticsViewButtons();
  loadStatistics();
}

function updateStatisticsViewButtons() {
  const weekSelected = statisticsView === 'week';

  weekViewButton?.classList.toggle(
    'selected',
    weekSelected
  );

  monthViewButton?.classList.toggle(
    'selected',
    !weekSelected
  );

  weekViewButton?.setAttribute(
    'aria-pressed',
    String(weekSelected)
  );

  monthViewButton?.setAttribute(
    'aria-pressed',
    String(!weekSelected)
  );
}

function moveStatisticsPeriod(direction) {
  const anchor = new Date(statisticsAnchorDate);

  if (statisticsView === 'week') {
    statisticsAnchorDate =
      addDays(anchor, direction * 7);
  } else {
    statisticsAnchorDate =
      new Date(
        anchor.getFullYear(),
        anchor.getMonth() + direction,
        1
      );
  }

  loadStatistics();
}

async function loadStatistics() {
  if (!statisticsChartElement) return;

  const user = await getCurrentUser();
  if (!user) return;

  const period = getStatisticsPeriod(
    statisticsView,
    statisticsAnchorDate
  );

  statisticsPeriodLabelElement.textContent =
    period.label;

  nextPeriodButton.disabled =
    period.end >= getIndiaToday();

  statisticsChartElement.innerHTML =
    '<p class="empty-state">Loading statistics…</p>';

  const { data, error } = await supabase
    .from('daily_study_stats')
    .select('study_date, study_seconds')
    .eq('user_id', user.id)
    .gte('study_date', formatIsoDate(period.start))
    .lte('study_date', formatIsoDate(period.end))
    .order('study_date');

  if (error) {
    console.error('Could not load statistics:', error);

    statisticsChartElement.innerHTML =
      '<p class="empty-state">Statistics could not be loaded.</p>';

    return;
  }

  const secondsByDate = new Map(
    (data ?? []).map(row => [
      row.study_date,
      Number(row.study_seconds) || 0
    ])
  );

  const dateRows = [];

  for (
    let current = new Date(period.start);
    current <= period.end;
    current = addDays(current, 1)
  ) {
    const dateKey = formatIsoDate(current);

    dateRows.push({
      date: new Date(current),
      dateKey,
      seconds: secondsByDate.get(dateKey) ?? 0
    });
  }

  renderStatistics(dateRows, period);
}

function renderStatistics(dateRows, period) {
  statisticsChartElement.replaceChildren();

  const totalSeconds = dateRows.reduce(
    (sum, row) => sum + row.seconds,
    0
  );

  const activeRows = dateRows.filter(
    row => row.seconds > 0
  );

  const today = getIndiaToday();

  const completedOrCurrentRows = dateRows.filter(
    row => row.date <= today
  );

  const calendarDayCount =
    Math.max(1, completedOrCurrentRows.length);

  const calendarAverage =
    Math.floor(totalSeconds / calendarDayCount);

  const activeAverage =
    activeRows.length > 0
      ? Math.floor(totalSeconds / activeRows.length)
      : 0;

  statisticsTotalElement.textContent =
    formatStudyTime(totalSeconds);

  statisticsCalendarAverageElement.textContent =
    formatStudyTime(calendarAverage);

  statisticsActiveAverageElement.textContent =
    formatStudyTime(activeAverage);
    
  const maximumSeconds = 12 * 3600;

  for (const row of dateRows) {
    const column =
      document.createElement('div');

    column.className = 'statistics-bar-column';

    const value =
      document.createElement('span');

    value.className = 'statistics-bar-value';

    value.textContent =
      row.seconds > 0
        ? formatCompactStudyTime(row.seconds)
        : '0m';

    const track =
      document.createElement('div');

    track.className = 'statistics-bar-track';

    const bar =
      document.createElement('div');

    bar.className = 'statistics-bar';

    const height =
      row.seconds > 0
        ? Math.max(
            2,
            (row.seconds / maximumSeconds) * 100
          )
        : 0;

    bar.style.height = `${height}%`;

    track.appendChild(bar);

    const label =
      document.createElement('span');

    label.className = 'statistics-bar-label';

    label.textContent =
      statisticsView === 'week'
        ? new Intl.DateTimeFormat(
            'en-IN',
            { weekday: 'short' }
          ).format(row.date)
        : String(row.date.getDate());

    column.title =
      `${formatDisplayDate(row.date)}: ` +
      `${formatStudyTime(row.seconds)}`;

    column.append(
      value,
      track,
      label
    );

    statisticsChartElement.appendChild(column);
  }

  statisticsAccessibleSummaryElement.textContent =
    `${period.label}. ` +
    `Total study time ${formatStudyTime(totalSeconds)}. ` +
    `Daily average ${formatStudyTime(calendarAverage)}. ` +
    `Average on active days ${formatStudyTime(activeAverage)}.`;
}

function getIndiaToday() {
  const parts = new Intl.DateTimeFormat(
    'en-CA',
    {
      timeZone: INDIA_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }
  ).formatToParts(new Date());

  const values = Object.fromEntries(
    parts.map(part => [part.type, part.value])
  );

  return new Date(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day)
  );
}

function getStatisticsPeriod(view, anchorDate) {
  const anchor = new Date(anchorDate);

  if (view === 'month') {
    const start = new Date(
      anchor.getFullYear(),
      anchor.getMonth(),
      1
    );

    const end = new Date(
      anchor.getFullYear(),
      anchor.getMonth() + 1,
      0
    );

    const label = new Intl.DateTimeFormat(
      'en-IN',
      {
        month: 'long',
        year: 'numeric'
      }
    ).format(start);

    return { start, end, label };
  }

  const day = anchor.getDay();

  const mondayOffset =
    day === 0 ? -6 : 1 - day;

  const start =
    addDays(anchor, mondayOffset);

  const end =
    addDays(start, 6);

  const label =
    `${formatDisplayDate(start)} – ${formatDisplayDate(end)}`;

  return { start, end, label };
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function formatIsoDate(date) {
  const year = date.getFullYear();

  const month =
    String(date.getMonth() + 1).padStart(2, '0');

  const day =
    String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function formatDisplayDate(date) {
  return new Intl.DateTimeFormat(
    'en-IN',
    {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    }
  ).format(date);
}

function formatStudyTime(totalSeconds) {
  const safeSeconds =
    Math.max(0, Math.floor(Number(totalSeconds) || 0));

  const hours =
    Math.floor(safeSeconds / 3600);

  const minutes =
    Math.floor((safeSeconds % 3600) / 60);

  if (hours === 0) {
    return `${minutes}m`;
  }

  return `${hours}h ${minutes}m`;
}

function formatCompactStudyTime(totalSeconds) {
  const safeSeconds =
    Math.max(0, Math.floor(Number(totalSeconds) || 0));

  const hours =
    Math.floor(safeSeconds / 3600);

  const minutes =
    Math.floor((safeSeconds % 3600) / 60);

  if (hours > 0 && minutes > 0) {
    return `${hours}h${minutes}m`;
  }

  if (hours > 0) {
    return `${hours}h`;
  }

  return `${minutes}m`;
}

async function updateTimezone() {
    const user = await getCurrentUser();
    if (!user) return;

    const timezone =
        Intl.DateTimeFormat().resolvedOptions().timeZone;

    await supabase
        .from('profiles')
        .update({
            timezone
        })
        .eq('id', user.id);
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
