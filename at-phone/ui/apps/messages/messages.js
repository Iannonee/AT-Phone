/* ============================================================
   messages.js — logica app Messaggi (rebuild)
   ============================================================ */
'use strict';

// ── Stato ────────────────────────────────────────────────────
let myNumber           = null;
let conversations      = [];
let activeConversation = null;
let messages           = [];
let attachOpen         = false;

// ── NUI bridge ───────────────────────────────────────────────
let reqId = 0;
const pending = {};

function luaCall(action, payload = {}) {
    return new Promise(resolve => {
        const id = ++reqId;
        pending[id] = resolve;
        window.parent.postMessage({ type: 'luaCallback', action, payload, reqId: id }, '*');
        setTimeout(() => { if (pending[id]) { delete pending[id]; resolve({}); } }, 5000);
    });
}

window.addEventListener('message', e => {
    const msg = e.data;
    if (!msg) return;
    if (msg.type === 'nuiResponse' && pending[msg.reqId]) {
        const res = pending[msg.reqId];
        delete pending[msg.reqId];
        res(msg.response || {});
        return;
    }
    handleMessage(msg);
});

function handleMessage(msg) {
    switch (msg.type) {
        case 'phoneStatus':
        case 'openPhone':
            myNumber = msg.number || myNumber;
            break;
        case 'conversations':
            conversations = msg.data || [];
            renderConversations();
            break;
        case 'messages':
            if (activeConversation && msg.data?.targetNumber === activeConversation.contactNumber) {
                messages = msg.data.messages || [];
                renderMessages();
            }
            break;
        case 'messageSent':
            if (activeConversation && msg.message?.receiverNumber === activeConversation.contactNumber) {
                appendMessage(msg.message);
            }
            break;
        case 'messageReceived':
            if (activeConversation && msg.message?.senderNumber === activeConversation.contactNumber) {
                appendMessage(msg.message);
                luaCall('markRead', { fromNumber: msg.message.senderNumber });
            } else {
                luaCall('getConversations');
            }
            break;
        case 'messageError':
            showToast(msg.error || 'Errore');
            break;
        case 'onlinePlayers':
            updateOnline(msg.data || []);
            break;
    }
}

// ── Init ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    luaCall('getConversations');

    document.getElementById('search-input').addEventListener('input', () => renderConversations(document.getElementById('search-input').value));
    document.getElementById('btn-close').addEventListener('click', () => window.parent.postMessage({ type: 'closeApp' }, '*'));
    document.getElementById('btn-compose').addEventListener('click', showCompose);
    document.getElementById('btn-back').addEventListener('click', goBack);
    document.getElementById('btn-call-contact').addEventListener('click', callContact);
    document.getElementById('btn-attach').addEventListener('click', toggleAttach);
    document.getElementById('btn-send').addEventListener('click', sendText);
    document.getElementById('msg-input').addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendText(); }
    });

    document.querySelectorAll('.attach-option').forEach(btn => {
        btn.addEventListener('click', () => {
            const type = btn.dataset.type;
            closeAttach();
            if (type === 'image')    sendImage();
            if (type === 'location') sendLocation();
        });
    });

    document.addEventListener('click', e => {
        if (attachOpen && !e.target.closest('.input-bar')) closeAttach();
    });
});

// ── Navigazione schermate ────────────────────────────────────
function showScreen(id) {
    const current = document.querySelector('.screen.active');
    const target  = document.getElementById(id);
    if (!target || target === current) return;

    const goingForward = id !== 'screen-list';

    if (current) {
        if (goingForward) {
            current.classList.add('prev');
            current.classList.remove('active');
        } else {
            current.classList.remove('active');
        }
    }

    if (!goingForward) {
        const prev = document.querySelector('.screen.prev');
        if (prev) prev.classList.remove('prev');
    }

    target.classList.remove('prev');
    target.classList.add('active');
}

function goBack() {
    activeConversation = null;
    showScreen('screen-list');
    luaCall('getConversations');
}

// ── Lista conversazioni ───────────────────────────────────────
function renderConversations(filter = '') {
    const list  = document.getElementById('conv-list');
    const empty = document.getElementById('empty-convs');
    const lower = filter.toLowerCase();

    list.querySelectorAll('.conv-item').forEach(el => el.remove());

    const filtered = conversations.filter(c =>
        !filter || c.name.toLowerCase().includes(lower) || c.contactNumber.includes(lower)
    );

    if (filtered.length === 0) {
        empty.style.display = '';
        return;
    }
    empty.style.display = 'none';

    filtered.forEach(conv => {
        const el = document.createElement('div');
        el.className = 'conv-item';
        el.innerHTML = `
            <div class="avatar" style="${avatarStyle(conv.name)}">
                ${initials(conv.name)}
                <div class="avatar-dot ${conv.online ? 'online' : ''}"></div>
            </div>
            <div class="conv-meta">
                <div class="conv-meta-top">
                    <span class="conv-name">${esc(conv.name)}</span>
                    <span class="conv-time">${fmtTime(conv.lastTime)}</span>
                </div>
                <div class="conv-preview">${esc(conv.lastMessage)}</div>
            </div>
            ${conv.unread > 0 ? `<div class="badge">${conv.unread > 9 ? '9+' : conv.unread}</div>` : ''}
        `;
        el.addEventListener('click', () => openChat(conv));
        list.appendChild(el);
    });
}

function updateOnline(players) {
    conversations.forEach(c => { c.online = players.some(p => p.number === c.contactNumber); });
    renderConversations(document.getElementById('search-input').value);
}

// ── Chat ─────────────────────────────────────────────────────
function openChat(conv) {
    activeConversation = conv;
    messages = [];
    document.getElementById('chat-contact-name').textContent = conv.name;
    document.getElementById('chat-contact-status').textContent = conv.online ? 'Online' : '';
    document.getElementById('messages-area').innerHTML = '';
    showScreen('screen-chat');
    luaCall('getMessages', { targetNumber: conv.contactNumber, offset: 0 });
    luaCall('markRead',    { fromNumber: conv.contactNumber });
}

function renderMessages() {
    const area = document.getElementById('messages-area');
    area.innerHTML = '';
    let lastDate = null;

    messages.forEach(msg => {
        const d = fmtDate(msg.sentAt);
        if (d !== lastDate) {
            lastDate = d;
            const div = document.createElement('div');
            div.className = 'date-divider';
            div.textContent = d;
            area.appendChild(div);
        }
        area.appendChild(buildBubble(msg));
    });
    scrollBottom();
}

function appendMessage(msg) {
    const area = document.getElementById('messages-area');
    area.appendChild(buildBubble(msg));
    scrollBottom();
}

function buildBubble(msg) {
    const isOut = msg.senderNumber === myNumber;
    const row = document.createElement('div');
    row.className = `msg-row ${isOut ? 'out' : 'in'}`;

    if (msg.type === 'image') {
        row.innerHTML = `
            <div class="msg-bubble msg-image">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
                </svg>
                <span>Immagine</span>
            </div>
            <div class="msg-ts">${fmtTimeShort(msg.sentAt)}</div>
        `;
    } else if (msg.type === 'location') {
        const loc = typeof msg.content === 'object' ? msg.content : {};
        row.innerHTML = `
            <div class="msg-bubble" style="padding:0;background:none;border:none;">
                <div class="msg-location" data-x="${loc.x||0}" data-y="${loc.y||0}" data-z="${loc.z||0}" data-label="${esc(loc.label||'')}">
                    <div class="location-map">
                        <div class="location-pin">
                            <svg width="20" height="28" viewBox="0 0 20 28" fill="none">
                                <path d="M10 0C5.58 0 2 3.58 2 8c0 5.5 8 14 8 14s8-8.5 8-14C18 3.58 14.42 0 10 0z" fill="var(--green)"/>
                                <circle cx="10" cy="8" r="3.5" fill="#fff"/>
                            </svg>
                        </div>
                    </div>
                    <div class="location-label">${esc(loc.label || 'Posizione')}</div>
                </div>
            </div>
            <div class="msg-ts">${fmtTimeShort(msg.sentAt)}</div>
        `;
        row.querySelector('.msg-location').addEventListener('click', () => {
            window.parent.postMessage({ type: 'luaCallback', action: 'setLocationBlip', payload: loc }, '*');
        });
    } else {
        row.innerHTML = `
            <div class="msg-bubble">${esc(msg.content || '')}</div>
            <div class="msg-ts">${fmtTimeShort(msg.sentAt)}</div>
        `;
    }

    return row;
}

function scrollBottom() {
    const a = document.getElementById('messages-area');
    a.scrollTop = a.scrollHeight;
}

// ── Invio ─────────────────────────────────────────────────────
function sendText() {
    if (!activeConversation) return;
    const input = document.getElementById('msg-input');
    const text  = input.textContent.trim();
    if (!text) return;
    input.textContent = '';
    luaCall('sendMessage', { targetNumber: activeConversation.contactNumber, type: 'text', content: text });
}

function sendImage() {
    if (!activeConversation) return;
    luaCall('sendMessage', { targetNumber: activeConversation.contactNumber, type: 'image', content: '[immagine]' });
}

async function sendLocation() {
    if (!activeConversation) return;
    const loc = await luaCall('requestLocation', {});
    if (!loc || !loc.x) return;
    luaCall('sendMessage', { targetNumber: activeConversation.contactNumber, type: 'location', content: loc });
}

function callContact() {
    if (!activeConversation) return;
    window.parent.postMessage({ type: 'openApp', app: 'calls' }, '*');
    setTimeout(() => {
        window.parent.postMessage({ type: 'luaCallback', action: 'startCall', payload: { targetNumber: activeConversation.contactNumber } }, '*');
    }, 300);
}

function showCompose() {
    const n = prompt('Numero destinatario:');
    if (!n || !n.trim()) return;
    openChat({ contactNumber: n.trim(), name: n.trim(), online: false, unread: 0, lastMessage: '', lastTime: '' });
}

// ── Attach menu ───────────────────────────────────────────────
function toggleAttach() {
    attachOpen = !attachOpen;
    const m = document.getElementById('attach-menu');
    if (attachOpen) {
        m.style.display = 'flex';
        requestAnimationFrame(() => m.classList.add('open'));
    } else {
        closeAttach();
    }
}

function closeAttach() {
    attachOpen = false;
    const m = document.getElementById('attach-menu');
    m.classList.remove('open');
    setTimeout(() => { if (!attachOpen) m.style.display = 'none'; }, 150);
}

// ── Toast ─────────────────────────────────────────────────────
function showToast(msg) {
    let t = document.querySelector('.toast');
    if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t); }
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 3000);
}

// ── Utility ───────────────────────────────────────────────────
function initials(name) {
    if (!name) return '?';
    const p = name.trim().split(/\s+/);
    return (p[0][0] + (p[1] ? p[1][0] : '')).toUpperCase();
}

const GRADIENTS = [
    '#1a3a2a','#1a2a3a','#2a1a3a','#3a2a1a','#1a1a3a'
];

function avatarStyle(name) {
    const idx = [...(name||'')].reduce((a,c) => a + c.charCodeAt(0), 0) % GRADIENTS.length;
    return `background:${GRADIENTS[idx]}`;
}

function esc(s) {
    if (!s) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function fmtTime(ts) {
    if (!ts) return '';
    const d = new Date((ts+'').replace(' ','T'));
    if (isNaN(d)) return '';
    const diff = Date.now() - d;
    if (diff < 86400000) return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    if (diff < 604800000) return ['Dom','Lun','Mar','Mer','Gio','Ven','Sab'][d.getDay()];
    return `${d.getDate()}/${d.getMonth()+1}`;
}

function fmtTimeShort(ts) {
    if (!ts) return '';
    const d = new Date((ts+'').replace(' ','T'));
    if (isNaN(d)) return '';
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fmtDate(ts) {
    if (!ts) return '';
    const d = new Date((ts+'').replace(' ','T'));
    if (isNaN(d)) return '';
    const today = new Date();
    if (d.toDateString() === today.toDateString()) return 'Oggi';
    const yest = new Date(today); yest.setDate(today.getDate()-1);
    if (d.toDateString() === yest.toDateString()) return 'Ieri';
    return d.toLocaleDateString('it-IT', { day:'numeric', month:'long' });
}

function pad(n) { return String(n).padStart(2,'0'); }
