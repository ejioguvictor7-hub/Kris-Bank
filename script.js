const API_URL = ["127.0.0.1", "localhost"].includes(window.location.hostname)
  ? "http://127.0.0.1:8000"
  : "https://kris-bank-backend.onrender.com";

var KB = (function () {
  var ACCOUNTS_KEY = 'krisbank_accounts';
  var SESSION_KEY = 'krisbank_session';

  function readAccounts() {
    try {
      var raw = localStorage.getItem(ACCOUNTS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function writeAccounts(accounts) {
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
  }

  function generateAccountNumber(existing) {
    var num;
    do {
      num = String(Math.floor(1000000000 + Math.random() * 8999999999));
    } while (existing.some(function (a) { return a.number === num; }));
    return num;
  }

  function formatNaira(amount) {
    var n = Number(amount) || 0;
    return '₦' + n.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function formatDate(ts) {
    var d = new Date(ts);
    return d.toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' }) +
      ' · ' + d.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' });
  }

  function signup(data) {
    var accounts = readAccounts();
    var number = generateAccountNumber(accounts);
    var account = {
      number: number,
      name: data.name,
      type: data.type,
      pin: data.pin,
      balance: Number(data.deposit) || 0,
      transactions: [
        {
          ts: Date.now(),
          desc: 'Opening deposit',
          amount: Number(data.deposit) || 0,
          balanceAfter: Number(data.deposit) || 0
        }
      ]
    };
    accounts.push(account);
    writeAccounts(accounts);
    setSession(number);
    return account;
  }

  function login(number, pin) {
    var accounts = readAccounts();
    var account = accounts.find(function (a) { return a.number === number; });
    if (!account) return { ok: false, error: 'No account found with that number.' };
    if (account.pin !== pin) return { ok: false, error: 'Incorrect PIN.' };
    setSession(number);
    return { ok: true, account: account };
  }

  function setSession(number) {
    localStorage.setItem(SESSION_KEY, number);
  }

  function getSession() {
    return localStorage.getItem(SESSION_KEY);
  }

  function logout() {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    localStorage.removeItem(SESSION_KEY);
    window.location.href = 'index.html';
  }

  function getAccountByNumber(number) {
    return readAccounts().find(function (a) { return a.number === number; }) || null;
  }

  function saveAccount(updated) {
    var accounts = readAccounts();
    var idx = accounts.findIndex(function (a) { return a.number === updated.number; });
    if (idx === -1) return false;
    accounts[idx] = updated;
    writeAccounts(accounts);
    return true;
  }

  function deposit(number, amount, desc) {
    var account = getAccountByNumber(number);
    if (!account) return { ok: false, error: 'Account not found.' };
    amount = Number(amount);
    if (!amount || amount <= 0) return { ok: false, error: 'Enter an amount greater than zero.' };
    account.balance += amount;
    account.transactions.unshift({
      ts: Date.now(),
      desc: desc || 'Deposit',
      amount: amount,
      balanceAfter: account.balance
    });
    saveAccount(account);
    return { ok: true, account: account };
  }

  function withdraw(number, amount, desc) {
    var account = getAccountByNumber(number);
    if (!account) return { ok: false, error: 'Account not found.' };
    amount = Number(amount);
    if (!amount || amount <= 0) return { ok: false, error: 'Enter an amount greater than zero.' };
    if (amount > account.balance) return { ok: false, error: 'Insufficient balance for that withdrawal.' };
    account.balance -= amount;
    account.transactions.unshift({
      ts: Date.now(),
      desc: desc || 'Withdrawal',
      amount: -amount,
      balanceAfter: account.balance
    });
    saveAccount(account);
    return { ok: true, account: account };
  }

  function transfer(fromNumber, toNumber, amount, desc) {
    amount = Number(amount);
    if (!amount || amount <= 0) return { ok: false, error: 'Enter an amount greater than zero.' };
    if (toNumber === fromNumber) return { ok: false, error: "You can't send money to your own account." };
    var from = getAccountByNumber(fromNumber);
    var to = getAccountByNumber(toNumber);
    if (!from) return { ok: false, error: 'Your account could not be found.' };
    if (!to) return { ok: false, error: 'No Kris Bank account found with that number (this demo only knows accounts created in this browser).' };
    if (amount > from.balance) return { ok: false, error: 'Insufficient balance for that transfer.' };

    from.balance -= amount;
    from.transactions.unshift({
      ts: Date.now(),
      desc: (desc ? desc + ' — ' : '') + 'Sent to ' + toNumber,
      amount: -amount,
      balanceAfter: from.balance
    });
    to.balance += amount;
    to.transactions.unshift({
      ts: Date.now(),
      desc: (desc ? desc + ' — ' : '') + 'Received from ' + fromNumber,
      amount: amount,
      balanceAfter: to.balance
    });
    saveAccount(from);
    saveAccount(to);
    return { ok: true, account: from };
  }

  return {
    signup: signup,
    login: login,
    logout: logout,
    getSession: getSession,
    getAccountByNumber: getAccountByNumber,
    deposit: deposit,
    withdraw: withdraw,
    transfer: transfer,
    formatNaira: formatNaira,
    formatDate: formatDate
  };
})();

document.addEventListener('DOMContentLoaded', function () {

  /* ---------- Login / signup modal ---------- */
  var overlay = document.getElementById('loginOverlay');
  var openBtn = document.getElementById('openLogin');
  var closeBtn = document.getElementById('closeLogin');

  if (openBtn && overlay) {
    openBtn.addEventListener('click', function () {
      overlay.classList.add('open');
    });
  }
  if (closeBtn && overlay) {
    closeBtn.addEventListener('click', function () {
      overlay.classList.remove('open');
    });
  }
  if (overlay) {
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) overlay.classList.remove('open');
    });
  }

  var tabs = document.querySelectorAll('.modal-tab');
  var paneLogin = document.getElementById('paneLogin');
  var paneSignup = document.getElementById('paneSignup');
  tabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      tabs.forEach(function (t) { t.classList.remove('active'); });
      tab.classList.add('active');
      var isLogin = tab.getAttribute('data-tab') === 'login';
      if (paneLogin) paneLogin.hidden = !isLogin;
      if (paneSignup) paneSignup.hidden = isLogin;
    });
  });

  var loginForm = document.getElementById('loginForm');
  var loginError = document.getElementById('loginError');
  if (loginForm) {
      loginForm.addEventListener('submit', async function (e) {
          e.preventDefault();

          var email = document.getElementById('loginEmail').value.trim();
          var password = document.getElementById('loginPassword').value;

          loginError.textContent = '';
    
          try {
              var response = await fetch(`${API_URL}/auth/login`, {
                  method: 'POST',
                  headers: {
                      'Content-Type': 'application/json'
                  },
                  body: JSON.stringify({
                      email: email,
                      password: password
                  })
              });

              var data = await response.json();

              if (!response.ok) {
                  loginError.textContent =
                      data.detail || 'Login failed.';
                  return;
              }

              localStorage.setItem('access_token', data.access_token);
              localStorage.setItem('refresh_token', data.refresh_token);

              window.location.href = 'dashboard.html';

          } catch (error) {
              console.error(error);
              loginError.textContent =
                  'Unable to connect to the server.';
          }
      });
  }

  var signupForm = document.getElementById('signupForm');
  var signupError = document.getElementById('signupError');

  if (signupForm) {
      signupForm.addEventListener('submit', async function (e) {
          e.preventDefault();

          var firstName = document.getElementById('signupFirstName').value.trim();
          var lastName = document.getElementById('signupLastName').value.trim();
          var email = document.getElementById('signupEmail').value.trim();
          var phoneNumber = document.getElementById('signupPhone').value.trim();
          var password = document.getElementById('signupPassword').value;

          signupError.textContent = '';

          try {
              var response = await fetch(`${API_URL}/auth/register`, {
                  method: 'POST',
                  headers: {
                      'Content-Type': 'application/json'
                  },
                  body: JSON.stringify({
                      first_name: firstName,
                      last_name: lastName,
                      email: email,
                      phone_number: phoneNumber,
                      password: password
                  })
              });

              var data = await response.json();

              if (!response.ok) {
                  signupError.textContent = data.detail || 'Registration failed.';
                  return;
              }

              console.log('Registration successful:', data);

              alert(
                  `Account created successfully!\n\nYour account number is: ${data.account_number}`
              );

              signupForm.reset();

          } catch (error) {
              console.error(error);
              signupError.textContent =
                  'Unable to connect to the server.';
          }
      });
  }

  /* ---------- Netlify contact form ---------- */
  var contactForm = document.getElementById('contactForm');
  var contactNote = document.getElementById('contactFormNote');
  if (contactForm) {
    contactForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var data = new FormData(contactForm);
      var submitBtn = contactForm.querySelector('button[type="submit"]');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Sending…';
      }
      fetch('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(data).toString()
      })
        .then(function () {
          contactForm.reset();
          if (contactNote) contactNote.textContent = 'Message sent — a relationship manager will reply within one business day.';
          if (submitBtn) submitBtn.textContent = 'Sent';
        })
        .catch(function () {
          if (contactNote) contactNote.textContent = 'Something went wrong sending that — try again, or email hello@krisbank.example directly.';
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Send message';
          }
        });
    });
  }

  /* ---------- Mobile nav ---------- */
  var menuToggle = document.getElementById('menuToggle');
  if (menuToggle) {
    menuToggle.addEventListener('click', function () {
      var links = document.querySelector('.nav-links');
      if (links.style.display === 'flex') {
        links.style.display = 'none';
      } else {
        links.style.display = 'flex';
        links.style.flexDirection = 'column';
        links.style.position = 'absolute';
        links.style.top = '64px';
        links.style.right = '20px';
        links.style.background = 'var(--cream)';
        links.style.border = '1px solid var(--grey-line)';
        links.style.padding = '16px 20px';
        links.style.gap = '14px';
      }
    });
  }

  /* ---------- Deposit ---------- */
  var depositForm = document.getElementById('depositForm');
  if (depositForm) {
    depositForm.addEventListener('submit', async function (e) {
      e.preventDefault();

      var amountInput = document.getElementById('depositAmount');
      var msg = document.getElementById('depositMsg');
      var submitBtn = depositForm.querySelector('button[type="submit"]');
      var amount = Number(amountInput.value);

      msg.className = 'field-error';
      msg.textContent = '';

      if (!amount || amount <= 0) {
        msg.textContent = 'Enter an amount greater than zero.';
        return;
      }

      submitBtn.disabled = true;

      try {
        var response = await authFetch('/accounts/me/deposit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ amount: amount })
        });

        var data = await response.json();

        if (!response.ok) {
          msg.textContent = typeof data.detail === 'string'
            ? data.detail
            : 'Please check the amount and try again.';
          return;
        }

        msg.className = 'field-success';
        msg.textContent = data.message ;
        depositForm.reset();
        loadDashboardData(); 
      } catch (error) {
        console.error(error);
        msg.textContent = 'Unable to connect to the server.';
      } finally {
        submitBtn.disabled = false;
      }
    });
  }

    /* ---------- Withdrawal ---------- */
  var withdrawalForm = document.getElementById('withdrawalForm');
  if (withdrawalForm) {
    withdrawalForm.addEventListener('submit', async function (e) {
      e.preventDefault();

      var amountInput = document.getElementById('withdrawalAmount');
      var msg = document.getElementById('withdrawalMsg');
      var submitBtn = withdrawalForm.querySelector('button[type="submit"]');
      var amount = Number(amountInput.value);

      msg.className = 'field-error';
      msg.textContent = '';

      if (!amount || amount <= 0) {
        msg.textContent = 'Enter an amount greater than zero.';
        return;
      }

      submitBtn.disabled = true;

      try {
        var response = await authFetch('/accounts/me/withdraw', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ amount: amount })
        });

        var data = await response.json();

        if (!response.ok) {
          msg.textContent = typeof data.detail === 'string'
            ? data.detail
            : 'Please check the amount and try again.';
          return;
        }

        msg.className = 'field-success';
        msg.textContent = data.message;
        withdrawalForm.reset();
        loadDashboardData(); 
      } catch (error) {
        console.error(error);
        msg.textContent = 'Unable to connect to the server.';
      } finally {
        submitBtn.disabled = false;
      }
    });
  }

  /* ---------- Transfer ---------- */
  var transferForm = document.getElementById('transferForm');
  if (transferForm) {
    transferForm.addEventListener('submit', async function (e) {
      e.preventDefault();

      var toInput = document.getElementById('transferTo');
      var amountInput = document.getElementById('transferAmount');
      var msg = document.getElementById('transferMsg');
      var submitBtn = transferForm.querySelector('button[type="submit"]');

      var accountNumber = toInput.value.trim(); // keep as a string
      var amount = Number(amountInput.value);

      msg.className = 'field-error';
      msg.textContent = '';

      if (!/^\d{10}$/.test(accountNumber)) {
        msg.textContent = 'Enter a valid 10-digit account number.';
        return;
      }
      if (!amount || amount <= 0) {
        msg.textContent = 'Enter an amount greater than zero.';
        return;
      }

      submitBtn.disabled = true;

      try {
        var response = await authFetch('/accounts/transfers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ account_number: accountNumber, amount: amount })
        });

        var data = await response.json();

        if (!response.ok) {
          msg.textContent = typeof data.detail === 'string'
            ? data.detail
            : 'Please check the details and try again.';
          return;
        }

        msg.className = 'field-success';
        msg.textContent = KB.formatNaira(data.amount) + ' sent to ' + data.receiver_name.toUpperCase() +
          '. Ref: ' + data.sender_reference;
        transferForm.reset();
        loadDashboardData();
      } catch (error) {
        console.error(error);
        msg.textContent = 'Unable to connect to the server.';
      } finally {
        submitBtn.disabled = false;
      }
    });
  }

  /* ---------- Dashboard (only runs on dashboard.html) ---------- */

  /* ---------- Auth helpers ---------- */
  var refreshPromise = null; // the refresh currently in progress, if any

  async function refreshTokens() {
    var refreshToken = localStorage.getItem('refresh_token');
    if (!refreshToken) return false;

    try {
      var response = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken })
      });

      if (!response.ok) {
        // The server rejected the token: the session is really over
        if (response.status === 401 || response.status === 403) {
          localStorage.removeItem('access_token');
          localStorage.removeItem('refresh_token');
        }
        return false;
      }

      var data = await response.json();
      localStorage.setItem('access_token', data.access_token);
      localStorage.setItem('refresh_token', data.refresh_token);
      return true;
    } catch (error) {
      // Network error: keep the tokens, they may still be valid
      return false;
    }
  }

  function refreshOnce() {
    if (!refreshPromise) {
      refreshPromise = refreshTokens().finally(function () {
        refreshPromise = null;
      });
    }
    return refreshPromise;
  }

  async function authFetch(path, options) {
    options = options || {};

    function send() {
      var token = localStorage.getItem('access_token');
      var headers = Object.assign({}, options.headers, {
        'Authorization': `Bearer ${token}`
      });
      return fetch(`${API_URL}${path}`, Object.assign({}, options, { headers: headers }));
    }

    var response = await send();
    if (response.status !== 401) return response;

    var refreshed = await refreshOnce();
    if (!refreshed) return response;

    return send(); // retry once with the new access token
  }

  async function getCurrentUser() {
    var response = await authFetch('/auth/me');
    if (!response.ok) {
      return null;
    }

    return await response.json();
  }


  async function getMyAccount() {
      var response = await authFetch('/accounts/me')

      if (!response.ok) {
          return null;
      }

      return await response.json();
  }

  async function getMyTransactions() {
    try {
      var response = await authFetch('/accounts/transactions')
    } catch (error) {
      console.error(error);
      return [];
    }
  
    if (!response.ok) {
        return [];
    }

    return await response.json();
  }

  async function loadDashboardData() {
    var transactions = await getMyTransactions();
    var account = await getMyAccount();

    document.getElementById('dashAcctNumber').textContent =
      account.account_number;

    document.getElementById('dashBalance').textContent =
      `₦${Number(account.balance).toLocaleString()}`;

    renderLedger(transactions); 
  }

  var dashRoot = document.getElementById('dashboardRoot');
  if (dashRoot) {
    initDashboard();
  }

  async function initDashboard() {
    var gate = document.getElementById('gate');
    var content = document.getElementById('dashboardContent');

    var user = null;
    var account = null;
    try {
      var user = await getCurrentUser();
      var account = await getMyAccount();
    } catch (error) {
      console.error(error);
    }
     
    // If the user is not authenticated, show the login gate
    if (!user || !account) {

      if (gate) gate.hidden = false;
      if (content) content.hidden = true;

      return;
    }
    

    // User is authenticated and has an account
    if (gate) gate.hidden = true;
    if (content) content.hidden = false;


    document.getElementById('dashName').textContent =
      `Welcome, ${user.first_name.toUpperCase()} ${user.last_name.toUpperCase()}`;
    loadDashboardData();
    
  }

  // if (document.getElementById('dashboardRoot')) {
  //   initDashboard();
  // }


  function renderLedger(transactions) {

    var tbody = document.getElementById('ledgerBody');
    var empty = document.getElementById('ledgerEmpty');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!transactions || !transactions.length) {
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;

    var CREDIT_TYPES = ['deposit', 'transfer_in'];

    transactions.forEach(function (t) {
      var tr = document.createElement('tr');
      var isCredit = CREDIT_TYPES.includes(t.transaction_type.toLowerCase());
      tr.innerHTML =
        '<td>' + KB.formatDate(t.created_at) + '</td>' +
        '<td>' + escapeHtml(t.reference) + '</td>' +
        '<td> '+ escapeHtml(t.transaction_type.replace('_', ' ')) + '</td>' +
        '<td class="' + (isCredit ? 'amt-credit' : 'amt-debit') + '">' +
        (isCredit ? '+' : '−') + KB.formatNaira(t.amount) +
        '</td>';
      tbody.appendChild(tr);
    });
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  /* ---------- Logout ---------- */
var logoutBtn = document.getElementById('logoutBtn');
if (logoutBtn) {
  logoutBtn.addEventListener('click', function () {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    window.location.href = 'index.html';
  });
}
});
