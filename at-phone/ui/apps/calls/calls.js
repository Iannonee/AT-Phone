'use strict';

/* ============================================================
   State
   ============================================================ */
let currentState  = 'dialpad';
let activeCallId  = null;
let dialBuffer    = '';
let callSeconds   = 0;
let timerInterval = null;
let isMuted       = false;
let isSpeaker     = false;

/* ============================================================
   NUI bridge
   ============================================================ */
let reqCounter = 0;
const pendingRequests = {};

function luaCall(action, payload) {
  if (payload === undefined) payload = {};
  var reqId = ++reqCounter;
  pendingRequests[reqId] = true;
  window.parent.postMessage({ type: 'luaCallback', action: action, payload: payload, reqId: reqId }, '*');
  // Auto-clean after 5s
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
  var data = msg.data || {};
  switch (msg.type) {

    case 'callRinging':
      activeCallId = data.callId;
      showState('outgoing');
      setCallMeta('out', data.callerName || data.targetNumber || '');
      break;

    case 'incomingCall':
      activeCallId = data.callId;
      showState('incoming');
      setCallMeta('inc', data.callerName || data.callerNumber || '');
      break;

    case 'callConnected':
      activeCallId = data.callId;
      showState('active');
      setCallMeta('act', data.withName || data.withNumber || '');
      startTimer();
      break;

    case 'callEnded':
      stopTimer();
      activeCallId = null;
      showState('dialpad');
      luaCall('getCallLog');
      break;

    case 'callFailed':
      stopTimer();
      activeCallId = null;
      showState('dialpad');
      var reason = data.reason;
      if (reason === 'busy') {
        showToast('Occupato');
      } else {
        showToast('Non raggiungibile');
      }
      luaCall('getCallLog');
      break;

    case 'callLog':
      renderRecentCalls(data);
      break;
  }
}

/* ============================================================
   State switching — solo class toggling, niente inline style
   ============================================================ */
function showState(id) {
  var states = document.querySelectorAll('.call-state');
  for (var i = 0; i < states.length; i++) {
    states[i].classList.remove('active');
  }
  var target = document.getElementById('state-' + id);
  if (target) target.classList.add('active');
  currentState = id;
}

/* ============================================================
   Avatar / name helpers
   ============================================================ */
function setCallMeta(prefix, nameOrNumber) {
  var avatarEl = document.getElementById(prefix + '-avatar');
  var nameEl   = document.getElementById(prefix + '-name');
  if (avatarEl) {
    var ini = initials(nameOrNumber);
    avatarEl.textContent = ini;
    avatarEl.style.background = avatarGradient(nameOrNumber);
  }
  if (nameEl) nameEl.textContent = nameOrNumber || '';
}

/* ============================================================
   Dialpad logic
   ============================================================ */
function updateDisplay() {
  var numEl  = document.getElementById('dial-number');
  var phEl   = document.getElementById('dial-placeholder');
  if (!numEl) return;
  if (dialBuffer.length > 0) {
    numEl.textContent  = dialBuffer;
    numEl.style.display = 'inline';
    if (phEl) phEl.style.display = 'none';
  } else {
    numEl.textContent  = '';
    numEl.style.display = 'none';
    if (phEl) phEl.style.display = 'inline';
  }
}

/* ============================================================
   Timer
   ============================================================ */
function startTimer() {
  callSeconds = 0;
  clearInterval(timerInterval);
  var timerEl = document.getElementById('act-timer');
  timerInterval = setInterval(function () {
    callSeconds++;
    var m = Math.floor(callSeconds / 60);
    var s = callSeconds % 60;
    if (timerEl) timerEl.textContent = m + ':' + (s < 10 ? '0' : '') + s;
  }, 1000);
}

function stopTimer() {
  clearInterval(timerInterval);
  timerInterval = null;
  callSeconds = 0;
}

/* ============================================================
   Recent calls renderer
   ============================================================ */
function renderRecentCalls(log) {
  var list = document.getElementById('recent-calls-list');
  if (!list) return;
  list.innerHTML = '';

  if (!log || log.length === 0) {
    list.innerHTML = '<div class="empty-state">Nessuna chiamata recente</div>';
    return;
  }

  for (var i = 0; i < log.length; i++) {
    (function (item) {
      var el = document.createElement('div');
      el.className = 'recent-item';

      var isMissed   = item.status === 'missed';
      var isOutgoing = item.direction === 'outgoing';
      var dirColor   = isMissed ? 'var(--red)' : isOutgoing ? 'var(--blue)' : 'var(--green)';
      var dirLabel   = isMissed ? 'Persa' : isOutgoing ? 'Uscente' : 'In arrivo';
      var durText    = item.duration > 0 ? formatDuration(item.duration) : '';
      var detailText = durText ? dirLabel + ' · ' + durText : dirLabel;

      el.innerHTML =
        '<div class="avatar" style="width:36px;height:36px;font-size:13px;background:' + avatarGradient(item.name || item.contactNumber) + '">'
        + esc(initials(item.name || item.contactNumber || ''))
        + '</div>'
        + '<div class="recent-info">'
        + '<div class="recent-name">' + esc(item.name || item.contactNumber || '') + '</div>'
        + '<div class="recent-detail" style="color:' + dirColor + '">' + esc(detailText) + '</div>'
        + '</div>'
        + '<span class="recent-time">' + esc(formatTime(item.startedAt)) + '</span>';

      el.addEventListener('click', function () {
        dialBuffer = (item.contactNumber || '').replace(/[^0-9*#]/g, '');
        updateDisplay();
      });

      list.appendChild(el);
    })(log[i]);
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
  var parts = name.trim().split(/\s+/);
  var first = parts[0] ? parts[0][0] : '';
  var second = parts[1] ? parts[1][0] : '';
  return (first + second).toUpperCase() || '?';
}

var AVATAR_COLORS = [
  'linear-gradient(135deg,#1a3d2e,#2a5c40)',
  'linear-gradient(135deg,#0a2d6b,#1a4c8c)',
  'linear-gradient(135deg,#5c1a0a,#8c3a1a)',
  'linear-gradient(135deg,#3a2800,#5c4200)',
  'linear-gradient(135deg,#1a0a5c,#2a1a8c)'
];

function avatarGradient(name) {
  if (!name) return AVATAR_COLORS[0];
  var code = 0;
  for (var i = 0; i < name.length; i++) code += name.charCodeAt(i);
  return AVATAR_COLORS[code % AVATAR_COLORS.length];
}

function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatTime(ts) {
  if (!ts) return '';
  var d = new Date(typeof ts === 'string' ? ts.replace(' ', 'T') : ts);
  if (isNaN(d)) return '';
  var now = new Date();
  if (now - d < 86400000) {
    return pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }
  return d.getDate() + '/' + (d.getMonth() + 1);
}

function formatDuration(seconds) {
  var m = Math.floor(seconds / 60);
  var s = seconds % 60;
  return m > 0 ? m + 'm ' + s + 's' : s + 's';
}

function pad2(n) { return n < 10 ? '0' + n : String(n); }

/* ============================================================
   Init
   ============================================================ */
document.addEventListener('DOMContentLoaded', function () {

  /* Show initial state */
  showState('dialpad');
  updateDisplay();

  /* Dial keys */
  var dialKeys = document.querySelectorAll('.dial-key');
  for (var k = 0; k < dialKeys.length; k++) {
    (function (btn) {
      btn.addEventListener('click', function () {
        if (dialBuffer.length >= 15) return;
        dialBuffer += btn.dataset.digit;
        updateDisplay();
      });
    })(dialKeys[k]);
  }

  /* Backspace */
  var bsBtn = document.getElementById('btn-backspace');
  if (bsBtn) {
    bsBtn.addEventListener('click', function () {
      dialBuffer = dialBuffer.slice(0, -1);
      updateDisplay();
    });
  }

  /* Dial */
  var dialBtn = document.getElementById('btn-dial');
  if (dialBtn) {
    dialBtn.addEventListener('click', function () {
      if (dialBuffer.length < 4) return;
      luaCall('startCall', { targetNumber: dialBuffer });
    });
  }

  /* Hangup (active state) */
  var hangupBtn = document.getElementById('btn-hangup');
  if (hangupBtn) {
    hangupBtn.addEventListener('click', function () {
      luaCall('hangupCall', { callId: activeCallId });
    });
  }

  /* Hangup (outgoing state) */
  var hangupOutBtn = document.getElementById('btn-hangup-out');
  if (hangupOutBtn) {
    hangupOutBtn.addEventListener('click', function () {
      luaCall('hangupCall', { callId: activeCallId });
    });
  }

  /* Decline */
  var declineBtn = document.getElementById('btn-decline');
  if (declineBtn) {
    declineBtn.addEventListener('click', function () {
      luaCall('declineCall', { callId: activeCallId });
      activeCallId = null;
      showState('dialpad');
    });
  }

  /* Answer */
  var answerBtn = document.getElementById('btn-answer');
  if (answerBtn) {
    answerBtn.addEventListener('click', function () {
      luaCall('answerCall', { callId: activeCallId });
    });
  }

  /* Mute (active) */
  var muteBtn = document.getElementById('btn-mute');
  if (muteBtn) {
    muteBtn.addEventListener('click', function () {
      isMuted = !isMuted;
      muteBtn.classList.toggle('active', isMuted);
    });
  }

  /* Mute (outgoing) */
  var muteOutBtn = document.getElementById('btn-mute-out');
  if (muteOutBtn) {
    muteOutBtn.addEventListener('click', function () {
      isMuted = !isMuted;
      muteOutBtn.classList.toggle('active', isMuted);
    });
  }

  /* Speaker (active) */
  var speakerBtn = document.getElementById('btn-speaker');
  if (speakerBtn) {
    speakerBtn.addEventListener('click', function () {
      isSpeaker = !isSpeaker;
      speakerBtn.classList.toggle('active', isSpeaker);
    });
  }

  /* Speaker (outgoing) */
  var speakerOutBtn = document.getElementById('btn-speaker-out');
  if (speakerOutBtn) {
    speakerOutBtn.addEventListener('click', function () {
      isSpeaker = !isSpeaker;
      speakerOutBtn.classList.toggle('active', isSpeaker);
    });
  }

  /* Nav back / close app */
  var closeBtn = document.getElementById('btn-close-app');
  if (closeBtn) {
    closeBtn.addEventListener('click', function () {
      window.parent.postMessage({ type: 'closeApp' }, '*');
    });
  }

  /* Load recent calls on open */
  luaCall('getCallLog');
});
