/* ============================================================
   at-phone — app.js
   Logica home screen: orologio, navigazione app, NUI bridge.
   ============================================================ */

'use strict';

// ============================================================
//  Stato globale
// ============================================================
let phoneOpen     = false;
let myNumber      = null;
let activeApp     = null;
let activeCallId  = null;
let callTimerInterval = null;
let callSeconds   = 0;
let badges        = { messages: 0, calls: 0 };
let notifQueue    = [];

// ============================================================
//  Orologio & data
// ============================================================
const DAYS_IT = ['Domenica','Lunedì','Martedì','Mercoledì','Giovedì','Venerdì','Sabato'];

function updateClock() {
    const now = new Date();
    const h = String(now.getHours()).padStart(2,'0');
    const m = String(now.getMinutes()).padStart(2,'0');
    document.getElementById('clock').textContent = `${h}:${m}`;
    document.getElementById('day-name').textContent = DAYS_IT[now.getDay()];
    document.getElementById('day-number').textContent = now.getDate();
}
updateClock();
setInterval(updateClock, 10000);

// ============================================================
//  Apertura / chiusura telefono
// ============================================================
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

// ============================================================
//  Navigazione app
// ============================================================
const appFrameContainer = document.getElementById('app-frame-container');
const appIframe         = document.getElementById('app-iframe');
const homeScreen        = document.getElementById('home-screen');
const statusBar         = document.getElementById('status-bar');

const APP_URLS = {
    messages: 'apps/messages/index.html',
    contacts: 'apps/contacts/index.html',
    calls:    'apps/calls/index.html',
};

function openApp(appName) {
    const url = APP_URLS[appName];
    if (!url) return; // app non ancora implementata

    activeApp = appName;
    homeScreen.style.display = 'none';
    appFrameContainer.classList.add('visible');
    appIframe.src = url;

    // Azzera badge quando si apre l'app
    if (badges[appName]) {
        badges[appName] = 0;
        updateBadge(appName);
    }
}

function closeActiveApp() {
    if (!activeApp) return;
    activeApp = null;
    appIframe.src = 'about:blank';
    appFrameContainer.classList.remove('visible');
    homeScreen.style.display = '';
}

// Click su icone app (griglia + dock)
document.querySelectorAll('.app-icon[data-app]').forEach(el => {
    el.addEventListener('click', () => {
        const app = el.dataset.app;
        if (app) openApp(app);
    });
});

// ============================================================
//  Comunicazione con gli iframe delle app
// ============================================================
window.addEventListener('message', (event) => {
    const msg = event.data;
    if (!msg || typeof msg !== 'object') return;

    switch (msg.type) {
        case 'closeApp':
            closeActiveApp();
            break;

        case 'luaCallback':
            // L'app iframe chiede di chiamare un NUI callback
            if (msg.action) {
                nuiCallback(msg.action, msg.payload || {}).then(res => {
                    // Ritrasmetti la risposta all'iframe
                    if (appIframe.contentWindow) {
                        appIframe.contentWindow.postMessage({
                            type:     'nuiResponse',
                            action:   msg.action,
                            response: res,
                            reqId:    msg.reqId,
                        }, '*');
                    }
                });
            }
            break;

        case 'openApp':
            // Un'app può chiedere di aprire un'altra app (es. messaggi apre chiamate)
            if (msg.app) openApp(msg.app);
            break;
    }
});

// Invia dati NUI all'iframe attivo
function forwardToIframe(data) {
    if (appIframe && appIframe.contentWindow) {
        try {
            appIframe.contentWindow.postMessage(data, '*');
        } catch(e) {}
    }
}

// ============================================================
//  NUI Bridge
// ============================================================
async function nuiCallback(action, data) {
    try {
        const res = await fetch(`https://at-phone/${action}`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(data),
        });
        return await res.json();
    } catch(e) {
        return {};
    }
}

// ============================================================
//  Ricezione messaggi dal gioco (SendNUIMessage)
// ============================================================
window.addEventListener('message', (event) => {
    const msg = event.data;
    if (!msg || typeof msg.type !== 'string') return;

    // Ignora i messaggi che vengono dagli iframe delle app
    if (event.source !== window) return;

    handleNUIMessage(msg);
});

function handleNUIMessage(msg) {
    switch (msg.type) {

        // ── Stato telefono ───────────────────────────────────
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

        // ── Messaggi ─────────────────────────────────────────
        case 'messageReceived':
            if (activeApp !== 'messages') {
                badges.messages = (badges.messages || 0) + 1;
                updateBadge('messages');
                pushNotification('Messaggi', `Da ${msg.message?.senderNumber}: ${truncate(msg.message?.content, 40)}`);
            }
            forwardToIframe(msg);
            break;

        case 'messageSent':
        case 'conversations':
        case 'messages':
        case 'messageError':
            forwardToIframe(msg);
            break;

        // ── Contatti ─────────────────────────────────────────
        case 'contacts':
        case 'contactSaved':
        case 'contactDeleted':
        case 'contactUpdated':
        case 'contactError':
        case 'onlinePlayers':
            forwardToIframe(msg);
            break;

        // ── Chiamate ─────────────────────────────────────────
        case 'callRinging':
            activeCallId = msg.data?.callId;
            if (activeApp !== 'calls') openApp('calls');
            forwardToIframe(msg);
            break;

        case 'incomingCall':
            activeCallId = msg.data?.callId;
            if (activeApp !== 'calls') openApp('calls');
            forwardToIframe(msg);
            pushNotification('Telefono', `Chiamata da ${msg.data?.callerName || msg.data?.callerNumber}`);
            break;

        case 'callConnected':
            activeCallId = msg.data?.callId;
            startCallTimer(msg.data?.withNumber);
            forwardToIframe(msg);
            break;

        case 'callEnded':
            stopCallTimer();
            activeCallId = null;
            if (msg.data?.reason === 'missed') {
                badges.calls = (badges.calls || 0) + 1;
                updateBadge('calls');
            }
            forwardToIframe(msg);
            break;

        case 'callFailed':
        case 'callError':
        case 'callLog':
            forwardToIframe(msg);
            break;
    }
}

// ============================================================
//  Badge
// ============================================================
function updateBadge(appName) {
    const count = badges[appName] || 0;
    document.querySelectorAll(`[data-app="${appName}"] .app-badge`).forEach(el => {
        el.textContent = count > 9 ? '9+' : String(count);
        el.classList.toggle('visible', count > 0);
    });
}

// ============================================================
//  Notifiche Home Screen
// ============================================================
function pushNotification(title, body) {
    const area = document.getElementById('notifications-area');

    // Max 2 notifiche visibili
    while (area.children.length >= 2) {
        area.removeChild(area.firstChild);
    }

    const now = new Date();
    const time = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;

    const card = document.createElement('div');
    card.className = 'notif-card';
    card.innerHTML = `
        <div class="notif-content">
            <div class="notif-title">${escapeHtml(title)}</div>
            <div class="notif-body">${escapeHtml(body)}</div>
        </div>
        <span class="notif-time">${time}</span>
    `;
    area.appendChild(card);

    // Rimuovi dopo 6 secondi
    setTimeout(() => {
        card.style.transition = 'opacity 0.4s, transform 0.4s';
        card.style.opacity = '0';
        card.style.transform = 'translateY(-8px)';
        setTimeout(() => card.remove(), 400);
    }, 6000);
}

// ============================================================
//  Dynamic Island — timer chiamata attiva
// ============================================================
function startCallTimer(withNumber) {
    const di       = document.getElementById('dynamic-island');
    const diInfo   = document.getElementById('di-call-info');
    const diName   = document.getElementById('di-name');
    const diTimer  = document.getElementById('di-timer');

    di.classList.add('expanded');
    diInfo.classList.add('active');
    diName.textContent = withNumber || 'Chiamata';

    callSeconds = 0;
    clearInterval(callTimerInterval);
    callTimerInterval = setInterval(() => {
        callSeconds++;
        const m = Math.floor(callSeconds / 60);
        const s = callSeconds % 60;
        diTimer.textContent = `${m}:${String(s).padStart(2,'0')}`;
    }, 1000);
}

function stopCallTimer() {
    clearInterval(callTimerInterval);
    callTimerInterval = null;
    callSeconds = 0;

    const di     = document.getElementById('dynamic-island');
    const diInfo = document.getElementById('di-call-info');

    di.classList.remove('expanded');
    diInfo.classList.remove('active');
    document.getElementById('di-timer').textContent = '0:00';
}

// ============================================================
//  Utility
// ============================================================
function truncate(str, max) {
    if (!str) return '';
    return str.length > max ? str.slice(0, max) + '…' : str;
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ============================================================
//  Pressione tasto Escape — chiude l'app attiva o il telefono
// ============================================================
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        if (activeApp) {
            closeActiveApp();
        } else if (phoneOpen) {
            closePhone();
        }
    }
});

// ============================================================
//  Init: richiedi stato telefono al load
// ============================================================
nuiCallback('requestPhone', {});
