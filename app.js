import { createClient }
    from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
    'https://yrdsjrnqnfbryeazostu.supabase.co',
    'sb_publishable_K3loapGQUqwFG80SdFYEpQ_Fo02nzGR'
);


// =========================================================
// CONFIGURATION
// =========================================================

const MAX_TIMER_SECONDS = 12 * 60 * 60;


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

const startTimerButton =
    document.getElementById('startTimerButton');

const pauseTimerButton =
    document.getElementById('pauseTimerButton');

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

let timerState = createEmptyTimerState();

let timerDisplayInterval = null;

let timerCancellationInProgress = false;


function createEmptyTimerState() {
    return {
        running: false,
        started_at: null,
        accumulated_seconds: 0
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

    startTimerButton.addEventListener(
        'click',
        startTimer
    );

    pauseTimerButton.addEventListener(
        'click',
        pauseTimer
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
    loginMessage.textContent = message;

    loginMessage.classList.toggle(
        'error-message',
        isError
    );
}


// =========================================================
// LOGOUT
// =========================================================

async function logout() {
    stopTimerDisplay();

    const { error } =
        await supabase.auth.signOut();

    if (error) {
        showNotification(
            error.message,
            'error'
        );

        return;
    }

    showLogin();
}


// =========================================================
// APPLICATION
// =========================================================

async function startApp() {
    loginSection.hidden = true;
    appSection.hidden = false;

    clearNotification();

    await Promise.all([
        loadBalance(),
        loadShop(),
        loadTimer()
    ]);
}


function showLogin() {
    loginSection.hidden = false;
    appSection.hidden = true;

    timerState =
        createEmptyTimerState();

    stopTimerDisplay();
    renderTimer();
}


// =========================================================
// USER
// =========================================================

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


// =========================================================
// BALANCE
// =========================================================

async function loadBalance() {
    const user =
        await getCurrentUser();

    if (!user) {
        return;
    }

    const { data, error } =
        await supabase
            .from('profiles')
            .select('balance')
            .eq('id', user.id)
            .single();

    if (error) {
        console.error(
            'Could not load balance:',
            error
        );

        balanceElement.textContent =
            'Balance unavailable';

        return;
    }

    balanceElement.textContent =
        `${data.balance} coins`;
}


// =========================================================
// LOAD TIMER
// =========================================================

async function loadTimer() {
    const user =
        await getCurrentUser();

    if (!user) {
        return;
    }

    const { data, error } =
        await supabase
            .from('study_timers')
            .select(`
                user_id,
                running,
                started_at,
                accumulated_seconds
            `)
            .eq('user_id', user.id)
            .maybeSingle();

    if (error) {
        console.error(
            'Could not load timer:',
            error
        );

        timerStatusElement.textContent =
            'Timer unavailable';

        return;
    }

    timerState =
        normaliseTimerState(data);

    const totalSeconds =
        getDisplayedSeconds();

    if (
        totalSeconds >=
        MAX_TIMER_SECONDS
    ) {
        await cancelExpiredTimer();
        return;
    }

    configureTimerDisplay();
    renderTimer();
}


function normaliseTimerState(data) {
    if (!data) {
        return createEmptyTimerState();
    }

    return {
        running:
            Boolean(data.running),

        started_at:
            data.started_at ?? null,

        accumulated_seconds:
            Math.max(
                0,
                Number(
                    data.accumulated_seconds
                ) || 0
            )
    };
}


function normaliseRpcTimer(data) {
    const timerData =
        Array.isArray(data)
            ? data[0]
            : data;

    return normaliseTimerState(
        timerData
    );
}


// =========================================================
// START TIMER
// =========================================================

async function startTimer() {
    setTimerControlsBusy(true);

    timerStatusElement.textContent =
        timerState.accumulated_seconds > 0
            ? 'Resuming timer...'
            : 'Starting timer...';

    const { data, error } =
        await supabase.rpc(
            'start_study_timer'
        );

    setTimerControlsBusy(false);

    if (error) {
        showNotification(
            error.message,
            'error'
        );

        await loadTimer();
        return;
    }

    timerState =
        normaliseRpcTimer(data);

    configureTimerDisplay();
    renderTimer();

    showNotification(
        'Study timer started.',
        'success'
    );
}


// =========================================================
// PAUSE TIMER
// =========================================================

async function pauseTimer() {
    if (!timerState.running) {
        return;
    }

    setTimerControlsBusy(true);

    timerStatusElement.textContent =
        'Pausing timer...';

    const { data, error } =
        await supabase.rpc(
            'pause_study_timer'
        );

    setTimerControlsBusy(false);

    if (error) {
        /*
         * A server function may automatically reset the
         * timer if the 12-hour maximum has been exceeded.
         */
        showNotification(*            error.message,
       *    'error'
        );

        aw*it loadTimer();
        return;
  * }

    timerState =
        norma*iseRpcTimer(data);

    configureT*merDisplay();
    renderTimer();

*   showNotification(
        'Stud* timer paused.',
        'success'*    );
}


// ====================*==================================*=
// RESET TIMER
// ==============*==================================*=======

function requestTimerRese*() {
    const confirmed =
       *window.confirm(
            'Reset*the timer? All uncollected study t*me will be lost.'
        );

    *f (!confirmed) {
        return;
 *  }

    resetTimer();
}


async f*nction resetTimer(
    showSuccess*essage = true
) {
    setTimerCont*olsBusy(true);

    const { error * =
        await supabase.rpc(
   *        'reset_study_timer'
      * );

    setTimerControlsBusy(fals*);

    if (error) {
        showN*tification(
            error.mess*ge,
            'error'
        );*
        return false;
    }

    *imerState =
        createEmptyTim*rState();

    configureTimerDispl*y();
    renderTimer();

    if (s*owSuccessMessage) {
        showNo*ification(
            'Study time* reset.',
            'success'
  *     );
    }

    return true;
}
*
// ==============================*==========================
// AUTO*ATIC 12-HOUR CANCELLATION
// =====*==================================*================

async function c*ncelExpiredTimer() {
    if (timer*ancellationInProgress) {
        r*turn;
    }

    timerCancellation*nProgress = true;

    stopTimerDi*play();

    const timerWasReset =*        await resetTimer(false);

*   timerCancellationInProgress = f*lse;

    if (timerWasReset) {
   *    showNotification(
            *The timer reached the 12-hour limi* and was cancelled. No coins were *warded.',
            'warning'
  *     );
    }
}


// =============*==================================*========
// COLLECT POINTS
// ====*==================================*=================

async function *ollectPoints() {
    const current*econds =
        getDisplayedSecon*s();

    if (
        currentSeco*ds >=
        MAX_TIMER_SECONDS
  * ) {
        await cancelExpiredTi*er();
        return;
    }

    i* (currentSeconds < 60) {
        s*owNotification(
            'Study*for at least one complete minute b*fore collecting.',
            'wa*ning'
        );

        return;
*   }

    setTimerControlsBusy(tru*);

    timerStatusElement.textCon*ent =
        'Collecting coins...*;

    const { data: points, error*} =
        await supabase.rpc(
  *         'collect_study_points'
  *     );

    setTimerControlsBusy(*alse);

    if (error) {
        s*owNotification(
            error.*essage,
            'error'
      * );

        await loadTimer();
  *     return;
    }

    const awar*edPoints =
        Number(points) *| 0;

    showNotification(
      * `${awardedPoints} coin${
        *   awardedPoints === 1
           *    ? ''
                : 's'
   *    } collected.`,
        'succes*'
    );

    await Promise.all([
        loadBalance(),
        load*imer()
    ]);
}


// ============*==================================*=========
// TIMER DISPLAY
// ====*==================================*=================

function config*reTimerDisplay() {
    stopTimerDi*play();

    renderTimer();

    t*merDisplayInterval =
        windo*.setInterval(
            updateTi*erDisplay,
            1000
      * );
}


function stopTimerDisplay(* {
    if (timerDisplayInterval !=* null) {
        window.clearInter*al(
            timerDisplayInterv*l
        );

        timerDisplay*nterval = null;
    }
}


function*updateTimerDisplay() {
    const t*talSeconds =
        getDisplayedS*conds();

    if (
        totalSe*onds >=
        MAX_TIMER_SECONDS
*   ) {
        cancelExpiredTimer(*;
        return;
    }

    rende*Timer();
}


function getDisplayed*econds() {
    const accumulatedSe*onds =
        Math.max(
         *  0,
            Number(
         *      timerState
                 *  .accumulated_seconds
           *) || 0
        );

    if (
      * !timerState.running ||
        !t*merState.started_at
    ) {
      * return accumulatedSeconds;
    }
*    const startedAt =
        new *ate(
            timerState.starte*_at
        ).getTime();

    if (*        !Number.isFinite(startedAt*
    ) {
        return accumulate*Seconds;
    }

    const runningS*conds =
        Math.max(
        *   0,
            Math.floor(
    *           (
                    D*te.now() -
                    sta*tedAt
                ) / 1000
   *        )
        );

    return (*        accumulatedSeconds +
     *  runningSeconds
    );
}


functi*n renderTimer() {
    const totalS*conds =
        Math.min(
        *   getDisplayedSeconds(),
        *   MAX_TIMER_SECONDS
        );

 *  timerElement.textContent =
     *  formatDuration(
            tota*Seconds
        );

    const isRu*ning =
        Boolean(timerState.*unning);

    if (isRunning) {
   *    timerStatusElement.textContent*=
            'Study session runni*g';
    } else if (totalSeconds > *) {
        timerStatusElement.tex*Content =
            'Study sessi*n paused';
    } else {
        ti*erStatusElement.textContent =
    *       'Ready to study';
    }

  * startTimerButton.textContent =
  *     !isRunning &&
        totalSe*onds > 0
            ? 'Resume'
  *         : 'Start';

    startTime*Button.disabled =
        isRunnin*;

    pauseTimerButton.disabled =*        !isRunning;

    resetTime*Button.disabled =
        totalSec*nds === 0;

    collectPointsButto*.disabled =
        totalSeconds <*60;
}


function formatDuration(
 *  totalSeconds
) {
    const safeS*conds =
        Math.max(
        *   0,
            Math.floor(total*econds)
        );

    const hour* =
        Math.floor(
           *safeSeconds / 3600
        );

   *const minutes =
        Math.floor*
            (
                saf*Seconds % 3600
            ) / 60
*       );

    const seconds =
   *    safeSeconds % 60;

    return *
        hours,
        minutes,
        seconds
    ]
        .map(v*lue =>
            String(value)
 *              .padStart(2, '0')
  *     )
        .join(':');
}


fun*tion setTimerControlsBusy(
    bus*
) {
    if (busy) {
        start*imerButton.disabled = true;
      * pauseTimerButton.disabled = true;*        resetTimerButton.disabled * true;
        collectPointsButton*disabled = true;
    } else {
    *   renderTimer();
    }
}


// ===*==================================*==================
// SHOP
// ====*==================================*=================

async function *oadShop() {
    shopElement.replac*Children();

    const user =
    *   await getCurrentUser();

    if*(!user) {
        return;
    }

 *  const [
        itemsResult,
        purchasesResult
    ] = await *romise.all([
        supabase
            .from('shop_items')
       *    .select(`
                id,
*               name,
             *  description,
                pri*e
            `)
            .eq('*ctive', true)
            .order('*rice'),

        supabase
        *   .from('purchases')
            *select('item_id')
            .eq(*user_id', user.id)
    ]);

    if*(itemsResult.error) {
        cons*le.error(
            'Could not l*ad shop:',
            itemsResult*error
        );

        shopElem*nt.textContent =
            'The *hop could not be loaded.';

      * return;
    }

    if (purchasesR*sult.error) {
        console.erro*(
            'Could not load purc*ases:',
            purchasesResul*.error
        );

        shopEle*ent.textContent =
            'You* purchases could not be loaded.';
*        return;
    }

    const p*rchasedIds =
        new Set(
    *       (
                purchases*esult.data ??
                []
 *          ).map(
                p*rchase =>
                    purc*ase.item_id
            )
        *;

    const items =
        items*esult.data ?? [];

    if (items.l*ngth === 0) {
        shopElement.*extContent =
            'No rewar*s are currently available.';

    *   return;
    }

    for (const i*em of items) {
        const shopI*em =
            createShopItem(
 *              item,
              * purchasedIds.has(
               *    item.id
                )
    *       );

        shopElement.app*ndChild(
            shopItem
    *   );
    }
}


function createSho*Item(
    item,
    purchased
) {
*   const article =
        documen*.createElement(
            'artic*e'
        );

    article.classNa*e =
        'shop-item';

    cons* itemDetails =
        document.cr*ateElement(
            'div'
    *   );

    itemDetails.className =*        'shop-item-details';

    *onst title =
        document.crea*eElement(
            'h3'
       *);

    title.textContent =
      * item.name;

    const description*=
        document.createElement(
*           'p'
        );

    des*ription.className =
        'item-*escription';

    description.text*ontent =
        item.description *?
        '';

    const price =
 *      document.createElement(
    *       'p'
        );

    price.c*assName =
        'item-price';

 *  price.textContent =
        `${i*em.price} coins`;

    itemDetails*append(
        title,
        des*ription,
        price
    );

   *const button =
        document.cr*ateElement(
            'button'
 *      );

    button.type = 'butto*';

    button.textContent =
     *  purchased
            ? 'View'
 *          : 'Unlock';

    if (pur*hased) {
        button.classList.*dd(
            'secondary-button'*        );
    }

    button.addEv*ntListener(
        'click',
     *  async () => {
            button*disabled = true;

            if (*urchased) {
                await *iewSecret(
                    ite*.id
                );
           *} else {
                await buy*tem(
                    item.id
 *              );
            }

  *         button.disabled = false;
*       }
    );

    article.appen*(
        itemDetails,
        but*on
    );

    return article;
}

*// ===============================*=========================
// BUY I*EM
// ============================*============================

asyn* function buyItem(itemId) {
    co*st { data, error } =
        await*supabase.rpc(
            'buy_ite*',
            {
                p*item_id: itemId
            }
    *   );

    if (error) {
        sh*