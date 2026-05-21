/* ============================================================
   app.js — home screen logic, iframe manager, NUI bridge
   ============================================================ */
'use strict';

// ── Stato ────────────────────────────────────────────────────
let phoneOpen  = false;
let myNumber   = null;
let activeApp  = null;
let activeCallId = null;
let callTimerInterval = null;
let callSeconds = 0;
let badges = { messages: 0, calls: 0 };

const DAYS_IT = ['Domenica','Lunedi','Martedi','Mercoledi','Giovedi','Venerdi','Sabato'];

// ── Orologio ─────────────────────────────────────────────────
function updateClock() {
    const now = new Date();
    const h = pad(now.getHours()), m = pad(now.getMinutes());
    document.getElementById('clock').textContent = `${h}:${m}`;
    document.getElementById('day-name').textContent = DAYS_IT[now.getDay()];
    document.getElementById('day-number').textContent = now.getDate();
}
updateClock();
setInterval(updateClock, 10000);

// ── Telefono apri/chiudi ──────────────────────────────────────
function openPhone() {
    phoneOpen = true;
    document.getElementById('phone-wrapper').classList.add('open');
}

function closePhone() {
    phoneOpen = false;
    document.getElementById('phone-wrapper').classList.remove('open');
    closeActiveApp();
    nuiCallback('closePhone', {});
}

// ── Navigazione app ───────────────────────────────────────────
const frameContainer = document.getElementById('app-frame-container');
const iframe         = document.getElementById('app-iframe');
const homeScreen     = document.getElementById('home-screen');

const APP_URLS = {
    messages: 'apps/messages/index.html',
    contacts: 'apps/contacts/index.html',
    calls:    'apps/calls/index.html',
};

function openApp(appName) {
    const url = APP_URLS[appName];
    if (!url) return;
    activeApp = appName;
    homeScreen.style.display = 'none';
    frameContainer.classList.add('visible');
    iframe.src = url;
    if (badges[appName]) { badges[appName] = 0; updateBadge(appName); }
}

function closeActiveApp() {
    if (!activeApp) return;
    activeApp = null;
    iframe.src = 'about:blank';
    frameContainer.classList.remove('visible');
    homeScreen.style.display = '';
}

// Click icone griglia + dock
document.querySelectorAll('.app-icon[data-app]').forEach(el => {
    el.addEventListener('click', () => openApp(el.dataset.app));
});

// Home indicator — chiude l'app attiva o il telefono
document.getElementById('home-indicator').addEventListener('click', () => {
    if (activeApp) {
        closeActiveApp();
    } else if (phoneOpen) {
        closePhone();
    }
});

// ESC keyboard
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
        if (activeApp) closeActiveApp();
        else if (phoneOpen) closePhone();
    }
});

// ── Comunicazione con iframe ──────────────────────────────────
window.addEventListener('message', e => {
    const msg = e.data;
    if (!msg || typeof msg !== 'object') return;

    // Messaggi dalle app iframe
    if (e.source !== window) {
        switch (msg.type) {
            case 'closeApp':
                closeActiveApp();
                break;
            case 'luaCallback':
                if (msg.action) {
                    nuiCallback(msg.action, msg.payload || {}).then(res => {
                        if (iframe.contentWindow) {
                            iframe.contentWindow.postMessage({
                                type: 'nuiResponse', action: msg.action,
                                response: res, reqId: msg.reqId,
                            }, '*');
                        }
                    });
                }
                break;
            case 'openApp':
                if (msg.app) openApp(msg.app);
                break;
        }
        return;
    }

    // Messaggi dal gioco (SendNUIMessage)
    handleNUI(msg);
});

function forwardToApp(data) {
    if (iframe && iframe.contentWindow) {
        try { iframe.contentWindow.postMessage(data, '*'); } catch(e) {}
    }
}

// ── NUI callback ─────────────────────────────────────────────
async function nuiCallback(action, data) {
    try {
        const res = await fetch(`https://at-phone/${action}`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(data),
        });
        return await res.json();
    } catch(e) { return {}; }
}

// ── Handler messaggi NUI dal gioco ────────────────────────────
function handleNUI(msg) {
    switch (msg.type) {

        // Stato telefono
        case 'phoneStatus':
            myNumber = msg.number;
            break;

        case 'openPhone':
            myNumber = msg.number || myNumber;
            openPhone();
            break;

        case 'closePhone':
            closePhone();
            break;

        // Messaggi
        case 'messageReceived':
            if (activeApp !== 'messages') {
                badges.messages = (badges.messages || 0) + 1;
                updateBadge('messages');
                pushNotif('Messaggi', `Da ${msg.message?.senderNumber}: ${truncate(msg.message?.content, 38)}`);
            }
            forwardToApp(msg);
            break;

        case 'messageSent':
        case 'conversations':
        case 'messages':
        case 'messageError':
            forwardToApp(msg);
            break;

        // Contatti
        case 'contacts':
        case 'contactSaved':
        case 'contactDeleted':
        case 'contactUpdated':
        case 'contactError':
        case 'onlinePlayers':
            forwardToApp(msg);
            break;

        // Chiamate
        case 'callRinging':
            activeCallId = msg.data?.callId;
            if (activeApp !== 'calls') openApp('calls');
            forwardToApp(msg);
            break;

        case 'incomingCall':
            activeCallId = msg.data?.callId;
            if (activeApp !== 'calls') openApp('calls');
            forwardToApp(msg);
            pushNotif('Telefono', `Chiamata da ${msg.data?.callerName || msg.data?.callerNumber}`);
            break;

        case 'callConnected':
            activeCallId = msg.data?.callId;
            startCallTimer(msg.data?.withNumber || msg.data?.withName || '');
            forwardToApp(msg);
            break;

        case 'callEnded':
            stopCallTimer();
            activeCallId = null;
            if (msg.data?.reason === 'missed') {
                badges.calls = (badges.calls || 0) + 1;
                updateBadge('calls');
            }
            forwardToApp(msg);
            break;

        case 'callFailed':
        case 'callError':
        case 'callLog':
            forwardToApp(msg);
            break;
    }
}

// ── Badge ─────────────────────────────────────────────────────
function updateBadge(appName) {
    const count = badges[appName] || 0;
    document.querySelectorAll(`[data-app="${appName}"] .app-badge`).forEach(el => {
        el.textContent = count > 9 ? '9+' : String(count);
        el.classList.toggle('visible', count > 0);
    });
}

// ── Notifiche home ────────────────────────────────────────────
function pushNotif(title, body) {
    const area = document.getElementById('notifications-area');
    while (area.children.length >= 2) area.removeChild(area.firstChild);

    const now  = new Date();
    const time = `${pad(now.getHours())}:${pad(now.getMinutes())}`;

    const card = document.createElement('div');
    card.className = 'notif-card';
    card.innerHTML = `
        <div class="notif-content">
            <div class="notif-title">${esc(title)}</div>
            <div class="notif-body">${esc(body)}</div>
        </div>
        <span class="notif-time">${time}</span>
    `;
    area.appendChild(card);

    setTimeout(() => {
        card.style.transition = 'opacity 0.35s, transform 0.35s';
        card.style.opacity = '0';
        card.style.transform = 'translateY(-6px)';
        setTimeout(() => card.remove(), 350);
    }, 6000);
}

// ── Dynamic Island — timer chiamata ───────────────────────────
function startCallTimer(withName) {
    const di    = document.getElementById('dynamic-island');
    const info  = document.getElementById('di-call-info');
    di.classList.add('expanded');
    info.classList.add('active');
    document.getElementById('di-name').textContent = withName || 'Chiamata';

    callSeconds = 0;
    clearInterval(callTimerInterval);
    callTimerInterval = setInterval(() => {
        callSeconds++;
        const m = Math.floor(callSeconds / 60);
        const s = callSeconds % 60;
        document.getElementById('di-timer').textContent = `${m}:${pad(s)}`;
    }, 1000);
}

function stopCallTimer() {
    clearInterval(callTimerInterval);
    callTimerInterval = null;
    callSeconds = 0;
    document.getElementById('dynamic-island').classList.remove('expanded');
    document.getElementById('di-call-info').classList.remove('active');
    document.getElementById('di-timer').textContent = '0:00';
}

// ── Utility ───────────────────────────────────────────────────
function pad(n) { return String(n).padStart(2,'0'); }
function truncate(s, max) { if (!s) return ''; return s.length > max ? s.slice(0,max)+'…' : s; }
function esc(s) {
    if (!s) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── Init ─────────────────────────────────────────────────────
nuiCallback('requestPhone', {});
