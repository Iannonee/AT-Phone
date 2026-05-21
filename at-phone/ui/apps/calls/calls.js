/* ============================================================
   calls.js — logica app Telefono
   ============================================================ */

'use strict';

// ============================================================
//  Stato
// ============================================================
let currentState   = 'dialpad'; // dialpad | outgoing | incoming | active
let activeCallId   = null;
let activeCallWith = null;
let callSeconds    = 0;
let timerInterval  = null;
let isMuted        = false;
let isSpeaker      = false;
let dialBuffer     = '';

// ============================================================
//  NUI bridge
// ============================================================
let reqCounter = 0;
const pendingRequests = {};

function luaCall(action, payload = {}) {
    return new Promise((resolve) => {
        const reqId = ++reqCounter;
        pendingRequests[reqId] = resolve;
        window.parent.postMessage({ type: 'luaCallback', action, payload, reqId }, '*');
        setTimeout(() => {
            if (pendingRequests[reqId]) { delete pendingRequests[reqId]; resolve({}); }
        }, 5000);
    });
}

window.addEventListener('message', (e) => {
    const msg = e.data;
    if (!msg) return;

    if (msg.type === 'nuiResponse' && pendingRequests[msg.reqId]) {
        const resolve = pendingRequests[msg.reqId];
        delete pendingRequests[msg.reqId];
        resolve(msg.response || {});
        return;
    }

    handleHomeMessage(msg);
});

function handleHomeMessage(msg) {
    switch (msg.type) {
        case 'callRinging':
            // Chiamata uscente in corso
            activeCallId   = msg.data?.callId;
            activeCallWith = msg.data?.targetNumber;
            showOutgoing(msg.data?.targetNumber);
            break;

        case 'incomingCall':
            activeCallId   = msg.data?.callId;
            activeCallWith = msg.data?.callerNumber;
            showIncoming(msg.data?.callerName || msg.data?.callerNumber);
            break;

        case 'callConnected':
            activeCallId   = msg.data?.callId;
            activeCallWith = msg.data?.withNumber;
            showActive(msg.data?.withNumber);
            break;

        case 'callEnded':
            stopTimer();
            activeCallId   = null;
            activeCallWith = null;
            showDialpad();
            // Ricarica recenti
            luaCall('getCallLog');
            break;

        case 'callFailed':
            stopTimer();
            activeCallId = null;
            const reason = msg.data?.reason;
            showDialpad();
            if (reason === 'busy')    showToast('Occupato');
            if (reason === 'offline') showToast('Numero non raggiungibile');
            luaCall('getCallLog');
            break;

        case 'callError':
            showToast(msg.error || 'Errore');
            break;

        case 'callLog':
            renderRecentCalls(msg.data || []);
            break;
    }
}

// ============================================================
//  Init
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    // Tastierino
    document.querySelectorAll('.dial-key').forEach(btn => {
        btn.addEventListener('click', () => appendDigit(btn.dataset.digit));
    });

    document.getElementById('btn-backspace').addEventListener('click', deleteDigit);
    document.getElementById('btn-dial').addEventListener('click', startCall);

    // Uscente
    document.getElementById('btn-hangup-out').addEventListener('click', hangup);
    document.getElementById('btn-mute-out').addEventListener('click', () => toggleMute('out'));
    document.getElementById('btn-speaker-out').addEventListener('click', () => toggleSpeaker('out'));

    // In arrivo
    document.getElementById('btn-answer').addEventListener('click', answerCall);
    document.getElementById('btn-decline').addEventListener('click', declineCall);

    // Attiva
    document.getElementById('btn-hangup').addEventListener('click', hangup);
    document.getElementById('btn-mute').addEventListener('click', () => toggleMute('act'));
    document.getElementById('btn-speaker').addEventListener('click', () => toggleSpeaker('act'));

    // Carica recenti
    luaCall('getCallLog');
});

// ============================================================
//  Tastierino
// ============================================================
function appendDigit(digit) {
    if (dialBuffer.length >= 10) return;
    dialBuffer += digit;
    updateDialDisplay();
}

function deleteDigit() {
    dialBuffer = dialBuffer.slice(0, -1);
    updateDialDisplay();
}

function updateDialDisplay() {
    document.getElementById('dial-number').textContent = formatDialBuffer(dialBuffer);
    document.getElementById('btn-backspace').style.visibility = dialBuffer.length ? 'visible' : 'hidden';
}

function formatDialBuffer(buf) {
    // Formatta 555XXXX → 555-XXXX
    if (buf.length > 3 && !buf.includes('-') && /^\d/.test(buf)) {
        return buf.slice(0,3) + '-' + buf.slice(3);
    }
    return buf;
}

// ============================================================
//  Chiamata uscente
// ============================================================
function startCall() {
    const number = dialBuffer.replace(/-/g,'');
    if (number.length < 4) return;

    const formatted = formatDialBuffer(dialBuffer);
    luaCall('startCall', { targetNumber: formatted });
}

function showOutgoing(number) {
    document.getElementById('out-name').textContent = number || '—';
    document.getElementById('out-avatar').textContent = initials(number || '?');
    setState('outgoing');
}

// ============================================================
//  Chiamata in arrivo
// ============================================================
function showIncoming(nameOrNumber) {
    document.getElementById('inc-name').textContent = nameOrNumber || '—';
    document.getElementById('inc-avatar').textContent = initials(nameOrNumber || '?');
    setState('incoming');
}

function answerCall() {
    if (!activeCallId) return;
    luaCall('answerCall', { callId: activeCallId });
}

function declineCall() {
    if (!activeCallId) return;
    luaCall('declineCall', { callId: activeCallId });
    activeCallId = null;
    showDialpad();
}

// ============================================================
//  Chiamata attiva
// ============================================================
function showActive(withNumber) {
    document.getElementById('act-name').textContent = withNumber || '—';
    document.getElementById('act-avatar').textContent = initials(withNumber || '?');
    setState('active');
    startTimer();
}

function hangup() {
    if (!activeCallId) return;
    luaCall('hangupCall', { callId: activeCallId });
}

// ============================================================
//  Mute / Speaker
// ============================================================
function toggleMute(suffix) {
    isMuted = !isMuted;
    const btn = document.getElementById('btn-mute' + (suffix === 'act' ? '' : '-out'));
    btn.classList.toggle('active', isMuted);
    // In FiveM il mute reale è gestito da mumble client-side,
    // qui è solo indicazione UI
}

function toggleSpeaker(suffix) {
    isSpeaker = !isSpeaker;
    const btn = document.getElementById('btn-speaker' + (suffix === 'act' ? '' : '-out'));
    btn.classList.toggle('active', isSpeaker);
}

// ============================================================
//  Timer
// ============================================================
function startTimer() {
    callSeconds = 0;
    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        callSeconds++;
        const m = Math.floor(callSeconds / 60);
        const s = callSeconds % 60;
        document.getElementById('act-timer').textContent = `${m}:${String(s).padStart(2,'0')}`;
    }, 1000);
}

function stopTimer() {
    clearInterval(timerInterval);
    timerInterval = null;
    callSeconds = 0;
}

// ============================================================
//  Cambio stato UI
// ============================================================
function setState(state) {
    currentState = state;
    document.querySelectorAll('.call-state').forEach(el => el.classList.remove('active'));
    document.getElementById(`state-${state}`).classList.add('active');
}

function showDialpad() {
    isMuted   = false;
    isSpeaker = false;
    dialBuffer = '';
    updateDialDisplay();
    setState('dialpad');
}

// ============================================================
//  Chiamate recenti
// ============================================================
function renderRecentCalls(log) {
    const list  = document.getElementById('recent-calls-list');
    const empty = document.getElementById('empty-recents');

    list.querySelectorAll('.recent-item').forEach(el => el.remove());

    if (!log || log.length === 0) {
        empty.style.display = '';
        return;
    }
    empty.style.display = 'none';

    log.forEach(item => {
        const el     = document.createElement('div');
        el.className = 'recent-item';

        const isMissed   = item.status === 'missed';
        const isOutgoing = item.direction === 'outgoing';
        const color      = isMissed ? 'var(--red)' : isOutgoing ? 'var(--blue)' : 'var(--green)';
        const dirLabel   = isMissed ? 'Persa' : isOutgoing ? 'Uscente' : 'In arrivo';
        const durStr     = item.duration > 0 ? formatDuration(item.duration) : '';

        el.innerHTML = `
            <div class="direction-icon">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    ${isOutgoing
                        ? '<line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/>'
                        : '<line x1="17" y1="7" x2="7" y2="17"/><polyline points="17 17 7 17 7 7"/>'}
                </svg>
            </div>
            <div class="recent-info">
                <div class="recent-name">${esc(item.name || item.contactNumber)}</div>
                <div class="recent-detail">
                    <span style="color:${color}">${dirLabel}</span>
                    ${durStr ? `<span>· ${durStr}</span>` : ''}
                </div>
            </div>
            <span class="recent-time">${formatTime(item.startedAt)}</span>
        `;

        // Cliccando sul recente lo richiama
        el.addEventListener('click', () => {
            dialBuffer = item.contactNumber.replace(/-/g, '');
            updateDialDisplay();
        });

        list.appendChild(el);
    });
}

// ============================================================
//  Toast
// ============================================================
function showToast(msg) {
    let toast = document.querySelector('.toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.className = 'toast';
        document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

// ============================================================
//  Utility
// ============================================================
function initials(name) {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    return (parts[0][0] + (parts[1] ? parts[1][0] : '')).toUpperCase();
}

function esc(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function formatTime(ts) {
    if (!ts) return '';
    const d = new Date(ts.replace ? ts.replace(' ','T') : ts);
    if (isNaN(d)) return '';
    const now  = new Date();
    const diff = now - d;
    if (diff < 86400000) {
        return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
    }
    return `${d.getDate()}/${d.getMonth()+1}`;
}

function formatDuration(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
}
