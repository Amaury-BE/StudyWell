import { createClient }
from 'https://esm.sh/@supabase/supabase-js'

const supabase = createClient(
    'https://yrdsjrnqnfbryeazostu.supabase.co',
    'sb_publishable_K3loapGQUqwFG80SdFYEpQ_Fo02nzGR'
);

// ---------------------
// LOGIN
// ---------------------

async function login() {

    const email =
        document.getElementById('email').value;

    const password =
        document.getElementById('password').value;

    const { error } =
        await supabase.auth.signInWithPassword({
            email,
            password
        });

    if (error) {
        alert(error.message);
        return;
    }

    await startApp();
}

window.login = login;


// ---------------------
// APP START
// ---------------------

async function startApp() {

    document.getElementById(
        'login'
    ).style.display = 'none';

    document.getElementById(
        'app'
    ).style.display = 'block';

    await loadBalance();
    await loadShop();
}

window.addEventListener(
    'DOMContentLoaded',
    async () => {

        const {
            data: { session }
        } =
            await supabase.auth.getSession();

        if (session) {
            startApp();
        }
    }
);


// ---------------------
// LOAD BALANCE
// ---------------------

async function loadBalance() {

    const {
        data: { user }
    } =
        await supabase.auth.getUser();

    const { data, error } =
        await supabase
            .from('profiles')
            .select('balance')
            .eq('id', user.id)
            .single();

    if (error) {
        console.error(error);
        return;
    }

    document.getElementById(
        'balance'
    ).innerText =
        `${data.balance} coins`;
}


// ---------------------
// CHANGE BALANCE
// ---------------------

async function changeBalance() {

    const amount =
        parseInt(
            document.getElementById(
                'balanceChange'
            ).value
        );

    if (isNaN(amount)) {
        alert('Invalid number');
        return;
    }

    const { error } =
        await supabase.rpc(
            'adjust_balance',
            {
                delta: amount
            }
        );

    if (error) {
        alert(error.message);
        return;
    }

    document.getElementById(
        'balanceChange'
    ).value = '';

    await loadBalance();
}

window.changeBalance =
    changeBalance;


// ---------------------
// LOAD SHOP
// ---------------------

async function loadShop() {

    const shopDiv =
        document.getElementById(
            'shop'
        );

    shopDiv.innerHTML = '';

    const {
        data: { user }
    } =
        await supabase.auth.getUser();

    const {
        data: items,
        error
    } =
        await supabase
            .from('shop_items')
            .select('*')
            .eq('active', true)
            .order('price');

    if (error) {
        console.error(error);
        return;
    }

    const {
        data: purchases
    } =
        await supabase
            .from('purchases')
            .select('item_id')
            .eq('user_id', user.id);

    const purchasedIds =
        purchases.map(
            p => p.item_id
        );

    items.forEach(item => {

        const div =
            document.createElement(
                'div'
            );

        div.className =
            'shop-item';

        let buttonHTML;

        if (
            purchasedIds.includes(
                item.id
            )
        ) {

            buttonHTML =
                `
                <button
                    onclick="viewSecret(${item.id})">
                    View
                </button>
            `;

        } else {

            buttonHTML =
                `
                <button
                    onclick="buyItem(${item.id})">
                    Unlock
                </button>
            `;
        }

        div.innerHTML =
            `
            <h3>${item.name}</h3>

            <p>
                ${item.description || ''}
            </p>

            <p>
                Price:
                ${item.price}
                coins
            </p>

            ${buttonHTML}
            `;

        shopDiv.appendChild(
            div
        );
    });
}


// ---------------------
// BUY ITEM
// ---------------------

async function buyItem(itemId) {

    const {
        data,
        error
    } =
        await supabase.rpc(
            'buy_item',
            {
                p_item_id: itemId
            }
        );

    if (error) {
        alert(error.message);
        return;
    }

    document.getElementById(
        'secretContent'
    ).innerText =
        data;

    await loadBalance();
    await loadShop();
}

window.buyItem =
    buyItem;


// ---------------------
// VIEW PURCHASED SECRET
// ---------------------

async function viewSecret(itemId) {

    const {
        data,
        error
    } =
        await supabase.rpc(
            'get_secret',
            {
                p_item_id: itemId
            }
        );

    if (error) {
        alert(error.message);
        return;
    }

    document.getElementById(
        'secretContent'
    ).innerText =
        data;
}

window.viewSecret =
    viewSecret;


// ---------------------
// LOGOUT
// ---------------------

async function logout() {

    await supabase.auth.signOut();

    location.reload();
}

window.logout =
    logout;