/* ============================================================
   messages.js — logica app Messaggi
   ============================================================ */

'use strict';

// ============================================================
//  Stato
// ============================================================
let myNumber          = null;
let conversations     = [];
let activeConversation = null; // { contactNumber, name }
let messages          = [];
let attachMenuOpen    = false;

// ============================================================
//  NUI bridge — chiama via postMessage alla home
// ============================================================
let reqCounter = 0;
const pendingRequests = {};

function luaCall(action, payload = {}) {
    return new Promise((resolve) => {
        const reqId = ++reqCounter;
        pendingRequests[reqId] = resolve;
        window.parent.postMessage({ type: 'luaCallback', action, payload, reqId }, '*');
        // Timeout di sicurezza
        setTimeout(() => {
            if (pendingRequests[reqId]) {
                delete pendingRequests[reqId];
                resolve({});
            }
        }, 5000);
    });
}

// Risposta dalla home per i callback
window.addEventListener('message', (e) => {
    const msg = e.data;
    if (!msg) return;

    // Risposta a luaCall
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
                // Aggiorna preview conversazione
                luaCall('getConversations');
            }
            break;

        case 'messageError':
            showToast(msg.error || 'Errore');
            break;

        case 'onlinePlayers':
            updateOnlineStatus(msg.data || []);
            break;
    }
}

// ============================================================
//  Init
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    luaCall('getConversations');

    // Ricerca
    document.getElementById('search-input').addEventListener('input', filterConversations);

    // Componi
    document.getElementById('btn-compose').addEventListener('click', showCompose);

    // Torna indietro
    document.getElementById('btn-back').addEventListener('click', goBack);

    // Chiama contatto
    document.getElementById('btn-call-contact').addEventListener('click', () => {
        if (!activeConversation) return;
        window.parent.postMessage({ type: 'openApp', app: 'calls' }, '*');
        // Passa il numero al telefono dopo un attimo
        setTimeout(() => {
            window.parent.postMessage({
                type:   'luaCallback',
                action: 'startCall',
                payload: { targetNumber: activeConversation.contactNumber },
            }, '*');
        }, 300);
    });

    // Allegati
    document.getElementById('btn-attach').addEventListener('click', toggleAttachMenu);
    document.querySelectorAll('.attach-option').forEach(btn => {
        btn.addEventListener('click', () => {
            const type = btn.dataset.type;
            closeAttachMenu();
            if (type === 'image')    sendImagePlaceholder();
            if (type === 'location') sendLocation();
        });
    });

    // Invio messaggio
    document.getElementById('btn-send').addEventListener('click', sendTextMessage);
    document.getElementById('msg-input').addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendTextMessage();
        }
    });

    // Chiudi menu allegati cliccando altrove
    document.addEventListener('click', (e) => {
        if (attachMenuOpen && !e.target.closest('.input-bar')) closeAttachMenu();
    });
});

// ============================================================
//  Navigazione schermate
// ============================================================
function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
}

function goBack() {
    activeConversation = null;
    showScreen('screen-list');
    luaCall('getConversations');
}

// ============================================================
//  Lista conversazioni
// ============================================================
function renderConversations(filter = '') {
    const list  = document.getElementById('conv-list');
    const empty = document.getElementById('empty-convs');
    const lower = filter.toLowerCase();

    const filtered = conversations.filter(c =>
        !filter || c.name.toLowerCase().includes(lower) || c.contactNumber.includes(lower)
    );

    // Rimuovi vecchi item (mantieni empty state)
    list.querySelectorAll('.conv-item').forEach(el => el.remove());

    if (filtered.length === 0) {
        empty.style.display = '';
        return;
    }
    empty.style.display = 'none';

    filtered.forEach(conv => {
        const el = document.createElement('div');
        el.className = 'conv-item';
        el.innerHTML = `
            <div class="avatar" style="${avatarGradient(conv.name)}">
                ${initials(conv.name)}
                <div class="avatar-dot ${conv.online ? 'online' : ''}"></div>
            </div>
            <div class="conv-meta">
                <div class="conv-meta-top">
                    <span class="conv-name">${esc(conv.name)}</span>
                    <span class="conv-time">${formatTime(conv.lastTime)}</span>
                </div>
                <div class="conv-preview">${esc(conv.lastMessage)}</div>
            </div>
            ${conv.unread > 0 ? `<div class="badge">${conv.unread}</div>` : ''}
        `;
        el.addEventListener('click', () => openConversation(conv));
        list.appendChild(el);
    });
}

function filterConversations() {
    renderConversations(document.getElementById('search-input').value);
}

function updateOnlineStatus(onlinePlayers) {
    conversations.forEach(c => {
        c.online = onlinePlayers.some(p => p.number === c.contactNumber);
    });
    renderConversations(document.getElementById('search-input').value);
}

// ============================================================
//  Chat
// ============================================================
function openConversation(conv) {
    activeConversation = conv;
    messages = [];

    document.getElementById('chat-contact-name').textContent = conv.name;
    document.getElementById('chat-contact-status').textContent = conv.online ? 'Online' : '';

    document.getElementById('messages-container').innerHTML = '';
    showScreen('screen-chat');

    luaCall('getMessages', { targetNumber: conv.contactNumber, offset: 0 });
    luaCall('markRead',    { fromNumber: conv.contactNumber });
}

function renderMessages() {
    const container = document.getElementById('messages-container');
    container.innerHTML = '';

    let lastDate = null;
    messages.forEach(msg => {
        const msgDate = formatDate(msg.sentAt);
        if (msgDate !== lastDate) {
            lastDate = msgDate;
            const divider = document.createElement('div');
            divider.className = 'date-divider';
            divider.textContent = msgDate;
            container.appendChild(divider);
        }
        container.appendChild(buildBubble(msg));
    });

    scrollToBottom();
}

function appendMessage(msg) {
    messages.push(msg);
    const container = document.getElementById('messages-container');
    container.appendChild(buildBubble(msg));
    scrollToBottom();
}

function buildBubble(msg) {
    const isOut = msg.senderNumber === myNumber;
    const row = document.createElement('div');
    row.className = `msg-row ${isOut ? 'outgoing' : 'incoming'}`;

    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble';

    if (msg.type === 'image') {
        bubble.innerHTML = `
            <div class="msg-image-placeholder">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2"/>
                    <circle cx="8.5" cy="8.5" r="1.5"/>
                    <polyline points="21 15 16 10 5 21"/>
                </svg>
                <span>Immagine</span>
            </div>
            <div class="msg-time">${formatTimeShort(msg.sentAt)}</div>
        `;
    } else if (msg.type === 'location') {
        const loc = typeof msg.content === 'object' ? msg.content : {};
        bubble.innerHTML = `
            <div class="msg-location" data-x="${loc.x||0}" data-y="${loc.y||0}" data-z="${loc.z||0}" data-label="${esc(loc.label||'')}">
                <div class="location-map">
                    <div class="location-pin">
                        <svg width="24" height="32" viewBox="0 0 24 32" fill="none">
                            <path d="M12 0C7.58 0 4 3.58 4 8c0 5.5 8 16 8 16s8-10.5 8-16c0-4.42-3.58-8-8-8z" fill="#34c759"/>
                            <circle cx="12" cy="8" r="4" fill="#fff"/>
                        </svg>
                    </div>
                </div>
                <div class="location-label">${esc(loc.label || 'Posizione')}</div>
            </div>
            <div class="msg-time">${formatTimeShort(msg.sentAt)}</div>
        `;
        // Tap → blip sulla mappa
        bubble.querySelector('.msg-location').addEventListener('click', () => {
            window.parent.postMessage({
                type:    'luaCallback',
                action:  'setLocationBlip',
                payload: loc,
            }, '*');
        });
    } else {
        bubble.innerHTML = `
            <div class="msg-text">${esc(msg.content || '')}</div>
            <div class="msg-time">${formatTimeShort(msg.sentAt)}</div>
        `;
    }

    row.appendChild(bubble);
    return row;
}

function scrollToBottom() {
    const c = document.getElementById('messages-container');
    c.scrollTop = c.scrollHeight;
}

// ============================================================
//  Invio messaggi
// ============================================================
function sendTextMessage() {
    if (!activeConversation) return;
    const input = document.getElementById('msg-input');
    const text  = input.textContent.trim();
    if (!text) return;

    input.textContent = '';
    luaCall('sendMessage', {
        targetNumber: activeConversation.contactNumber,
        type:    'text',
        content: text,
    });
}

function sendImagePlaceholder() {
    if (!activeConversation) return;
    luaCall('sendMessage', {
        targetNumber: activeConversation.contactNumber,
        type:    'image',
        content: '[immagine]',
    });
}

async function sendLocation() {
    if (!activeConversation) return;
    const loc = await luaCall('requestLocation', {});
    if (!loc || !loc.x) return;

    luaCall('sendMessage', {
        targetNumber: activeConversation.contactNumber,
        type:    'location',
        content: loc,
    });
}

// ============================================================
//  Componi (placeholder — apre un dialogo numerico)
// ============================================================
function showCompose() {
    const number = prompt('Numero destinatario:');
    if (!number || !number.trim()) return;

    const fakeConv = {
        contactNumber: number.trim(),
        name: number.trim(),
        online: false,
        unread: 0,
        lastMessage: '',
        lastTime: '',
    };
    openConversation(fakeConv);
}

// ============================================================
//  Menu allegati
// ============================================================
function toggleAttachMenu() {
    attachMenuOpen = !attachMenuOpen;
    document.getElementById('attach-menu').classList.toggle('open', attachMenuOpen);
}

function closeAttachMenu() {
    attachMenuOpen = false;
    document.getElementById('attach-menu').classList.remove('open');
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

const AVATAR_COLORS = [
    'linear-gradient(135deg,#1a5c2e,#2d6a4f)',
    'linear-gradient(135deg,#0a3d6b,#1a5c8c)',
    'linear-gradient(135deg,#6b0a2e,#8c1a4f)',
    'linear-gradient(135deg,#4a3500,#6b5200)',
    'linear-gradient(135deg,#1a0a6b,#2d1a8c)',
];

function avatarGradient(name) {
    const idx = [...(name||'')].reduce((a,c) => a + c.charCodeAt(0), 0) % AVATAR_COLORS.length;
    return `background:${AVATAR_COLORS[idx]}`;
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
    if (diff < 604800000) {
        return ['Dom','Lun','Mar','Mer','Gio','Ven','Sab'][d.getDay()];
    }
    return `${d.getDate()}/${d.getMonth()+1}`;
}

function formatTimeShort(ts) {
    if (!ts) return '';
    const d = new Date(ts.replace ? ts.replace(' ','T') : ts);
    if (isNaN(d)) return '';
    return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

function formatDate(ts) {
    if (!ts) return '';
    const d = new Date(ts.replace ? ts.replace(' ','T') : ts);
    if (isNaN(d)) return '';
    const today = new Date();
    if (d.toDateString() === today.toDateString()) return 'Oggi';
    const yesterday = new Date(today); yesterday.setDate(today.getDate()-1);
    if (d.toDateString() === yesterday.toDateString()) return 'Ieri';
    return d.toLocaleDateString('it-IT', { day:'numeric', month:'long' });
}
