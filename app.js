// ----------------------------------
// LOGIN
// ----------------------------------

const USERNAME = "student";
const PASSWORD = "studywell";

// Predefined shop items
const shopItems = [
    {
        id: 1,
        name: "Mathematics Course",
        price: 50,
        link: "https://example.com/math"
    },
    {
        id: 2,
        name: "Physics Notes",
        price: 100,
        link: "https://example.com/physics"
    },
    {
        id: 3,
        name: "Premium Exercises",
        price: 150,
        link: "https://example.com/exercises"
    }
];

let balance = Number(localStorage.getItem("balance")) || 0;
let unlockedItems =
    JSON.parse(localStorage.getItem("unlockedItems")) || [];

window.onload = () => {

    if (localStorage.getItem("loggedIn") === "true") {
        showApp();
    }
};

function login() {

    const user = document.getElementById("username").value;
    const pass = document.getElementById("password").value;

    if (user === USERNAME && pass === PASSWORD) {

        localStorage.setItem("loggedIn", "true");

        showApp();

    } else {

        document.getElementById("loginError").innerText =
            "Invalid credentials";
    }
}

function logout() {

    localStorage.removeItem("loggedIn");

    location.reload();
}

function showApp() {

    document.getElementById("loginPage").classList.add("hidden");
    document.getElementById("appPage").classList.remove("hidden");

    render();
}

// ----------------------------------
// WALLET
// ----------------------------------

function addMoney() {

    const amount =
        Number(document.getElementById("amountInput").value);

    if (amount <= 0) return;

    balance += amount;

    saveData();

    render();
}

// ----------------------------------
// SHOP
// ----------------------------------

function unlockItem(itemId) {

    const item =
        shopItems.find(i => i.id === itemId);

    if (!item) return;

    if (unlockedItems.includes(itemId)) {
        return;
    }

    if (balance < item.price) {

        alert("Not enough coins");

        return;
    }

    balance -= item.price;

    unlockedItems.push(itemId);

    saveData();

    render();
}

function render() {

    document.getElementById("balance").innerText =
        balance;

    const container =
        document.getElementById("shopContainer");

    container.innerHTML = "";

    shopItems.forEach(item => {

        const unlocked =
            unlockedItems.includes(item.id);

        const div = document.createElement("div");

        div.className =
            unlocked ? "shop-item unlocked" : "shop-item";

        div.innerHTML = `

            <h3>${item.name}</h3>

            <p>Price: ${item.price} coins</p>

            ${
                unlocked
                ? `
                    <strong>Unlocked ✓</strong>
                    ${item.link}
                        Open Content
                    </a>
                `
                : `
                    <button onclick="unlockItem(${item.id})">
                        Unlock
                    </button>
                `
            }
        `;

        container.appendChild(div);
    });
}

function saveData() {

    localStorage.setItem("balance", balance);

    localStorage.setItem(
        "unlockedItems",
        JSON.stringify(unlockedItems)
    );
}