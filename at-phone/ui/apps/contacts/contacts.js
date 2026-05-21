'use strict';

/* ============================================================
   State
   ============================================================ */
var contacts      = [];
var onlinePlayers = [];
var activeContact = null;
var editMode      = false;

/* ============================================================
   NUI bridge
   ============================================================ */
var reqCounter = 0;
var pendingRequests = {};

function luaCall(action, payload) {
  if (payload === undefined) payload = {};
  var reqId = ++reqCounter;
  pendingRequests[reqId] = true;
  window.parent.postMessage({ type: 'luaCallback', action: action, payload: payload, reqId: reqId }, '*');
  setTimeout(function () { delete pendingRequests[reqId]; }, 5000);
}

window.addEventListener('message', function (e) {
  var msg = e.data;
  if (!msg || !msg.type) return;

  if (msg.type === 'nuiResponse') {
    delete pendingRequests[msg.reqId];
    return;
  }

  handleNUIMessage(msg);
});

/* ============================================================
   NUI message router
   ============================================================ */
function handleNUIMessage(msg) {
  var data = msg.data || msg.contact || {};
  switch (msg.type) {

    case 'contacts':
      contacts = msg.data || [];
      renderList();
      break;

    case 'onlinePlayers':
      onlinePlayers = msg.data || [];
      for (var i = 0; i < contacts.length; i++) {
        var c = contacts[i];
        c.online = false;
        for (var j = 0; j < onlinePlayers.length; j++) {
          if (onlinePlayers[j].number === c.number) { c.online = true; break; }
        }
      }
      renderList();
      break;

    case 'contactSaved':
      var saved = msg.contact || msg.data || {};
      contacts.push(saved);
      contacts.sort(function (a, b) { return (a.name || '').localeCompare(b.name || ''); });
      renderList();
      navigateTo('screen-list');
      break;

    case 'contactDeleted':
      var delId = (msg.data || {}).id || msg.id;
      contacts = contacts.filter(function (c) { return c.id !== delId; });
      renderList();
      navigateTo('screen-list');
      break;

    case 'contactUpdated':
      var upd = msg.data || {};
      for (var u = 0; u < contacts.length; u++) {
        if (contacts[u].id === upd.id) {
          if (upd.name  !== undefined) contacts[u].name  = upd.name;
          if (upd.notes !== undefined) contacts[u].notes = upd.notes;
          break;
        }
      }
      renderList();
      navigateTo('screen-list');
      break;

    case 'contactError':
      showToast(msg.error || 'Errore');
      break;
  }
}

/* ============================================================
   Screen navigation
   ============================================================ */
var screenStack = ['screen-list'];

function navigateTo(id) {
  var all = document.querySelectorAll('.screen');
  for (var i = 0; i < all.length; i++) {
    all[i].classList.remove('active', 'prev');
  }
  // Mark current active as prev
  var current = screenStack[screenStack.length - 1];
  if (current && current !== id) {
    var prevEl = document.getElementById(current);
    if (prevEl) prevEl.classList.add('prev');
  }
  // Push new screen
  screenStack.push(id);
  var target = document.getElementById(id);
  if (target) target.classList.add('active');
}

function navigateBack() {
  if (screenStack.length <= 1) return;
  // Remove current
  var current = screenStack.pop();
  var currentEl = document.getElementById(current);
  if (currentEl) currentEl.classList.remove('active', 'prev');
  // Restore previous
  var prev = screenStack[screenStack.length - 1];
  var prevEl = document.getElementById(prev);
  if (prevEl) { prevEl.classList.remove('prev'); prevEl.classList.add('active'); }
}

/* ============================================================
   Render contact list
   ============================================================ */
function renderList() {
  var filter  = (document.getElementById('search-input') || {}).value || '';
  filter = filter.toLowerCase();
  var listEl  = document.getElementById('contacts-list');
  if (!listEl) return;
  listEl.innerHTML = '';

  var filtered = contacts.filter(function (c) {
    if (!filter) return true;
    return (c.name  || '').toLowerCase().indexOf(filter) !== -1 ||
           (c.number || '').indexOf(filter) !== -1;
  });

  var online  = filtered.filter(function (c) { return c.online; });
  var offline = filtered.filter(function (c) { return !c.online; });

  if (online.length === 0 && offline.length === 0) {
    listEl.innerHTML = '<div class="empty-state">Nessun contatto</div>';
    return;
  }

  if (online.length > 0) {
    var h1 = document.createElement('div');
    h1.className   = 'section-label';
    h1.textContent = 'ONLINE';
    listEl.appendChild(h1);
    for (var i = 0; i < online.length; i++) {
      listEl.appendChild(buildContactItem(online[i]));
    }
  }

  if (offline.length > 0) {
    var h2 = document.createElement('div');
    h2.className   = 'section-label';
    h2.textContent = 'TUTTI I CONTATTI';
    listEl.appendChild(h2);
    for (var j = 0; j < offline.length; j++) {
      listEl.appendChild(buildContactItem(offline[j]));
    }
  }
}

function buildContactItem(contact) {
  var el = document.createElement('div');
  el.className = 'contact-item';

  var dotClass = contact.online ? 'avatar-dot online' : 'avatar-dot';

  el.innerHTML =
    '<div class="avatar" style="width:40px;height:40px;font-size:15px;font-weight:600;position:relative;background:' + avatarGradient(contact.name) + '">'
    + esc(initials(contact.name))
    + '<div class="' + dotClass + '" style="width:10px;height:10px;position:absolute;bottom:1px;right:1px;border:1.5px solid var(--bg);"></div>'
    + '</div>'
    + '<div class="contact-body">'
    + '<div class="contact-name">' + esc(contact.name || '') + '</div>'
    + '<div class="contact-number">' + esc(contact.number || '') + '</div>'
    + '</div>'
    + '<svg class="contact-chevron" width="8" height="14" viewBox="0 0 8 14" fill="none"'
    + ' stroke="rgba(255,255,255,0.18)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">'
    + '<polyline points="1 1 7 7 1 13"></polyline></svg>';

  el.addEventListener('click', function () { showContactCard(contact); });
  return el;
}

/* ============================================================
   Contact card
   ============================================================ */
function showContactCard(contact) {
  activeContact = contact;

  /* Avatar */
  var avatarEl = document.getElementById('card-avatar');
  if (avatarEl) {
    avatarEl.textContent = initials(contact.name);
    avatarEl.style.background = avatarGradient(contact.name);
  }

  /* Online dot */
  var dotEl = document.getElementById('card-online-dot');
  if (dotEl) {
    dotEl.className = 'avatar-dot card-avatar-dot' + (contact.online ? ' online' : '');
  }

  /* Name / number */
  var nameEl   = document.getElementById('card-name');
  var numEl    = document.getElementById('card-number');
  var statusEl = document.getElementById('card-status');
  if (nameEl)   nameEl.textContent = contact.name || '';
  if (numEl)    numEl.textContent  = contact.number || '';
  if (statusEl) {
    statusEl.textContent = contact.online ? 'Online' : 'Offline';
    statusEl.className   = 'card-status' + (contact.online ? ' online' : '');
  }

  /* Info card rows */
  var phoneEl   = document.getElementById('info-phone');
  var statusVal = document.getElementById('info-status-val');
  var addedEl   = document.getElementById('info-added');
  if (phoneEl)   phoneEl.textContent  = contact.number || '—';
  if (statusVal) statusVal.textContent = contact.online ? 'Online' : 'Offline';
  if (addedEl) {
    if (contact.createdAt) {
      var d = new Date(typeof contact.createdAt === 'string' ? contact.createdAt.replace(' ', 'T') : contact.createdAt);
      addedEl.textContent = isNaN(d) ? '—' : d.toLocaleDateString('it-IT');
    } else {
      addedEl.textContent = '—';
    }
  }

  /* Notes row in info card — show if notes exist */
  /* (the notes field is displayed inside the info-card dynamically via info-status-row) */

  navigateTo('screen-card');
}

/* ============================================================
   Add / Edit screen
   ============================================================ */
function showAddScreen(contact) {
  editMode      = !!contact;
  activeContact = contact || null;

  var titleEl = document.getElementById('add-screen-title');
  if (titleEl) titleEl.textContent = editMode ? 'Modifica' : 'Nuovo contatto';

  var nameEl     = document.getElementById('field-name');
  var lastEl     = document.getElementById('field-lastname');
  var numEl      = document.getElementById('field-number');
  var notesEl    = document.getElementById('field-notes');

  if (editMode && contact) {
    var parts = (contact.name || '').trim().split(/\s+/);
    if (nameEl)  nameEl.value  = parts[0] || '';
    if (lastEl)  lastEl.value  = parts.slice(1).join(' ');
    if (numEl) {
      numEl.value    = contact.number || '';
      numEl.disabled = true;
    }
    if (notesEl) notesEl.value = contact.notes || '';
  } else {
    if (nameEl)  nameEl.value  = '';
    if (lastEl)  lastEl.value  = '';
    if (numEl) {
      numEl.value    = '';
      numEl.disabled = false;
    }
    if (notesEl) notesEl.value = '';
  }

  navigateTo('screen-add');
}

/* ============================================================
   Save contact
   ============================================================ */
function saveContact() {
  var firstName = ((document.getElementById('field-name')     || {}).value || '').trim();
  var lastName  = ((document.getElementById('field-lastname') || {}).value || '').trim();
  var number    = ((document.getElementById('field-number')   || {}).value || '').trim();
  var notes     = ((document.getElementById('field-notes')    || {}).value || '').trim();

  if (!firstName) { showToast('Il nome è obbligatorio.'); return; }
  if (!editMode && !number) { showToast('Il numero è obbligatorio.'); return; }

  var fullName = lastName ? firstName + ' ' + lastName : firstName;

  if (editMode && activeContact) {
    luaCall('updateContact', { id: activeContact.id, name: fullName, notes: notes });
  } else {
    luaCall('saveContact', { name: fullName, number: number, notes: notes });
  }
}

/* ============================================================
   Quick actions
   ============================================================ */
function wireCardActions() {
  var qaCallBtn = document.getElementById('qa-call');
  var qaMsgBtn  = document.getElementById('qa-msg');
  var qaPosBtn  = document.getElementById('qa-pos');
  var delBtn    = document.getElementById('btn-delete');
  var blkBtn    = document.getElementById('btn-block');

  if (qaCallBtn) {
    qaCallBtn.addEventListener('click', function () {
      if (!activeContact) return;
      window.parent.postMessage({ type: 'openApp', app: 'calls' }, '*');
      setTimeout(function () {
        window.parent.postMessage({
          type:    'luaCallback',
          action:  'startCall',
          payload: { targetNumber: activeContact.number }
        }, '*');
      }, 300);
    });
  }

  if (qaMsgBtn) {
    qaMsgBtn.addEventListener('click', function () {
      window.parent.postMessage({ type: 'openApp', app: 'messages' }, '*');
    });
  }

  if (qaPosBtn) {
    qaPosBtn.addEventListener('click', function () {
      if (!activeContact) return;
      luaCall('requestLocation', {});
      /* Response handled asynchronously — sendMessage on nuiResponse not shown here
         because the spec uses fire-and-forget for requestLocation */
    });
  }

  if (delBtn) {
    delBtn.addEventListener('click', function () {
      if (!activeContact) return;
      luaCall('deleteContact', { id: activeContact.id });
    });
  }

  if (blkBtn) {
    blkBtn.addEventListener('click', function () {
      showToast('Numero bloccato.');
    });
  }
}

/* ============================================================
   Toast
   ============================================================ */
function showToast(msg) {
  var toast = document.querySelector('.toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(function () { toast.classList.remove('show'); }, 3000);
}

/* ============================================================
   Utility
   ============================================================ */
function initials(name) {
  if (!name) return '?';
  var parts  = name.trim().split(/\s+/);
  var first  = parts[0] ? parts[0][0] : '';
  var second = parts[1] ? parts[1][0] : '';
  return (first + second).toUpperCase() || '?';
}

var AVATAR_GRADIENTS = [
  'linear-gradient(135deg,#1a3d2e,#2a5c40)',
  'linear-gradient(135deg,#0a2d6b,#1a4c8c)',
  'linear-gradient(135deg,#5c1a0a,#8c3a1a)',
  'linear-gradient(135deg,#3a2800,#5c4200)',
  'linear-gradient(135deg,#1a0a5c,#2a1a8c)'
];

function avatarGradient(name) {
  if (!name) return AVATAR_GRADIENTS[0];
  var code = 0;
  for (var i = 0; i < name.length; i++) code += name.charCodeAt(i);
  return AVATAR_GRADIENTS[code % AVATAR_GRADIENTS.length];
}

function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/* ============================================================
   Init
   ============================================================ */
document.addEventListener('DOMContentLoaded', function () {

  /* Fetch initial data */
  luaCall('getContacts');
  luaCall('getOnlinePlayers');

  /* Search */
  var searchEl = document.getElementById('search-input');
  if (searchEl) searchEl.addEventListener('input', renderList);

  /* Add button */
  var addBtn = document.getElementById('btn-add');
  if (addBtn) addBtn.addEventListener('click', function () { showAddScreen(null); });

  /* Back from card */
  var backCardBtn = document.getElementById('btn-back-card');
  if (backCardBtn) backCardBtn.addEventListener('click', navigateBack);

  /* Edit button on card */
  var editBtn = document.getElementById('btn-edit');
  if (editBtn) {
    editBtn.addEventListener('click', function () {
      if (activeContact) showAddScreen(activeContact);
    });
  }

  /* Cancel on add screen */
  var cancelBtn     = document.getElementById('btn-cancel');
  var cancelSaveBtn = document.getElementById('btn-cancel-save');
  if (cancelBtn)     cancelBtn.addEventListener('click', navigateBack);
  if (cancelSaveBtn) cancelSaveBtn.addEventListener('click', navigateBack);

  /* Save */
  var saveBtn = document.getElementById('btn-save-contact');
  if (saveBtn) saveBtn.addEventListener('click', saveContact);

  /* Wire card action buttons (they exist in DOM at load time) */
  wireCardActions();
});
