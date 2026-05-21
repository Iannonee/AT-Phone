/* ============================================================
   contacts.js — logica app Contatti
   ============================================================ */

'use strict';

// ============================================================
//  Stato
// ============================================================
let contacts      = [];
let onlinePlayers = [];
let activeContact = null;
let editMode      = false;

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
        case 'contacts':
            contacts = msg.data || [];
            renderList();
            break;

        case 'onlinePlayers':
            onlinePlayers = msg.data || [];
            contacts.forEach(c => {
                c.online = onlinePlayers.some(p => p.number === c.number);
            });
            renderList();
            break;

        case 'contactSaved':
            contacts.push(msg.contact);
            contacts.sort((a,b) => a.name.localeCompare(b.name));
            renderList();
            showScreen('screen-list');
            break;

        case 'contactDeleted':
            contacts = contacts.filter(c => c.id !== msg.data.id);
            renderList();
            showScreen('screen-list');
            break;

        case 'contactUpdated':
            const idx = contacts.findIndex(c => c.id === msg.data.id);
            if (idx !== -1) {
                contacts[idx].name  = msg.data.name;
                contacts[idx].notes = msg.data.notes;
            }
            renderList();
            showScreen('screen-list');
            break;

        case 'contactError':
            showToast(msg.error || 'Errore');
            break;
    }
}

// ============================================================
//  Init
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    luaCall('getContacts');
    luaCall('getOnlinePlayers');

    document.getElementById('search-input').addEventListener('input', renderList);
    document.getElementById('btn-add-contact').addEventListener('click', () => showAddScreen());
    document.getElementById('btn-back-card').addEventListener('click', () => showScreen('screen-list'));
    document.getElementById('btn-cancel-add').addEventListener('click', () => showScreen('screen-list'));
    document.getElementById('btn-cancel-add2').addEventListener('click', () => showScreen('screen-list'));
    document.getElementById('btn-save-contact').addEventListener('click', saveContact);
    document.getElementById('btn-edit-contact').addEventListener('click', () => {
        if (activeContact) showAddScreen(activeContact);
    });
});

// ============================================================
//  Navigazione
// ============================================================
function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
}

// ============================================================
//  Lista contatti
// ============================================================
function renderList() {
    const filter  = document.getElementById('search-input').value.toLowerCase();
    const listEl  = document.getElementById('contacts-list');
    listEl.innerHTML = '';

    const filtered = contacts.filter(c =>
        !filter ||
        c.name.toLowerCase().includes(filter) ||
        c.number.includes(filter)
    );

    // Sezione online
    const online  = filtered.filter(c => c.online);
    const offline = filtered.filter(c => !c.online);

    if (online.length === 0 && offline.length === 0) {
        listEl.innerHTML = `
            <div class="empty-state">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
                    <circle cx="9" cy="7" r="4"/>
                    <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
                </svg>
                <p>Nessun contatto</p>
            </div>
        `;
        return;
    }

    if (online.length > 0) {
        const header = document.createElement('div');
        header.className = 'section-header';
        header.textContent = 'Online';
        listEl.appendChild(header);
        online.forEach(c => listEl.appendChild(buildContactItem(c)));
    }

    if (offline.length > 0) {
        const header = document.createElement('div');
        header.className = 'section-header';
        header.textContent = 'Tutti i contatti';
        listEl.appendChild(header);
        offline.forEach(c => listEl.appendChild(buildContactItem(c)));
    }
}

function buildContactItem(contact) {
    const el = document.createElement('div');
    el.className = 'contact-item';
    el.innerHTML = `
        <div class="avatar" style="${avatarGradient(contact.name)}">
            ${initials(contact.name)}
            <div class="avatar-dot ${contact.online ? 'online' : ''}"></div>
        </div>
        <div class="contact-meta">
            <div class="contact-name">${esc(contact.name)}</div>
            <div class="contact-number">${esc(contact.number)}</div>
        </div>
        <svg class="contact-chevron" width="8" height="14" viewBox="0 0 8 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="1 1 7 7 1 13"/>
        </svg>
    `;
    el.addEventListener('click', () => showContactCard(contact));
    return el;
}

// ============================================================
//  Scheda contatto
// ============================================================
function showContactCard(contact) {
    activeContact = contact;

    const content = document.getElementById('contact-card-content');
    const createdAt = contact.createdAt
        ? new Date(contact.createdAt.replace(' ','T')).toLocaleDateString('it-IT')
        : '—';

    content.innerHTML = `
        <div class="card-hero">
            <div class="avatar lg" style="${avatarGradient(contact.name)}">
                ${initials(contact.name)}
                <div class="avatar-dot ${contact.online ? 'online' : ''}"></div>
            </div>
            <div class="card-name">${esc(contact.name)}</div>
            <div class="card-number">${esc(contact.number)}</div>
            ${contact.online ? '<div class="card-status">Online</div>' : ''}
        </div>

        <!-- Azioni rapide -->
        <div class="quick-actions">
            <button class="quick-action-btn" id="qa-call">
                <div class="quick-action-icon" style="background:var(--green-bg)">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--green)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.79 12a19.79 19.79 0 01-3.07-8.67A2 2 0 012.7 1.28h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 9a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/>
                    </svg>
                </div>
                <span class="quick-action-label">Chiama</span>
            </button>
            <button class="quick-action-btn" id="qa-msg">
                <div class="quick-action-icon" style="background:var(--surface)">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--text)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
                    </svg>
                </div>
                <span class="quick-action-label">Messaggio</span>
            </button>
            <button class="quick-action-btn" id="qa-pos">
                <div class="quick-action-icon" style="background:var(--blue-bg)">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/>
                    </svg>
                </div>
                <span class="quick-action-label">Posizione</span>
            </button>
        </div>

        <!-- Info -->
        <div class="card-section">
            <div class="card-section-title">Informazioni</div>
            <div class="card-row">
                <span class="card-row-label">Numero</span>
                <span class="card-row-value">${esc(contact.number)}</span>
            </div>
            ${contact.notes ? `<div class="card-row">
                <span class="card-row-label">Note</span>
                <span class="card-row-value">${esc(contact.notes)}</span>
            </div>` : ''}
            <div class="card-row">
                <span class="card-row-label">Aggiunto il</span>
                <span class="card-row-value">${createdAt}</span>
            </div>
        </div>

        <!-- Pericolo -->
        <div class="danger-zone">
            <button class="danger-btn" id="btn-delete">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
                    <path d="M10 11v6M14 11v6M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
                </svg>
                Elimina contatto
            </button>
            <button class="danger-btn" id="btn-block">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
                </svg>
                Blocca numero
            </button>
        </div>
    `;

    // Event listener azioni
    content.querySelector('#qa-call').addEventListener('click', () => callContact(contact));
    content.querySelector('#qa-msg').addEventListener('click', () => messageContact(contact));
    content.querySelector('#qa-pos').addEventListener('click', () => shareLocationTo(contact));
    content.querySelector('#btn-delete').addEventListener('click', () => deleteContact(contact));
    content.querySelector('#btn-block').addEventListener('click', () => showToast('Numero bloccato.'));

    showScreen('screen-card');
}

// ============================================================
//  Aggiungi / Modifica
// ============================================================
function showAddScreen(contact = null) {
    editMode      = !!contact;
    activeContact = contact;

    document.getElementById('add-title').textContent = contact ? 'Modifica contatto' : 'Nuovo contatto';

    if (contact) {
        const nameParts = contact.name.split(' ');
        document.getElementById('field-name').value     = nameParts[0] || '';
        document.getElementById('field-lastname').value = nameParts.slice(1).join(' ');
        document.getElementById('field-number').value   = contact.number;
        document.getElementById('field-notes').value    = contact.notes || '';
        document.getElementById('field-number').disabled = true;
    } else {
        document.getElementById('field-name').value     = '';
        document.getElementById('field-lastname').value = '';
        document.getElementById('field-number').value   = '';
        document.getElementById('field-notes').value    = '';
        document.getElementById('field-number').disabled = false;
    }

    showScreen('screen-add');
}

function saveContact() {
    const firstName = document.getElementById('field-name').value.trim();
    const lastName  = document.getElementById('field-lastname').value.trim();
    const number    = document.getElementById('field-number').value.trim();
    const notes     = document.getElementById('field-notes').value.trim();

    if (!firstName || (!editMode && !number)) {
        showToast('Nome e numero sono obbligatori.');
        return;
    }

    const fullName = lastName ? `${firstName} ${lastName}` : firstName;

    if (editMode && activeContact) {
        luaCall('updateContact', { id: activeContact.id, name: fullName, notes });
    } else {
        luaCall('saveContact', { name: fullName, number, notes });
    }
}

// ============================================================
//  Azioni
// ============================================================
function callContact(contact) {
    window.parent.postMessage({ type: 'openApp', app: 'calls' }, '*');
    setTimeout(() => {
        window.parent.postMessage({
            type:    'luaCallback',
            action:  'startCall',
            payload: { targetNumber: contact.number },
        }, '*');
    }, 300);
}

function messageContact(contact) {
    window.parent.postMessage({ type: 'openApp', app: 'messages' }, '*');
}

async function shareLocationTo(contact) {
    const loc = await luaCall('requestLocation', {});
    if (!loc || !loc.x) return;
    luaCall('sendMessage', {
        targetNumber: contact.number,
        type:    'location',
        content: loc,
    });
    showToast('Posizione inviata.');
}

function deleteContact(contact) {
    if (!confirm(`Eliminare ${contact.name}?`)) return;
    luaCall('deleteContact', { id: contact.id });
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
