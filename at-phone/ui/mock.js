/* ============================================================
   mock.js — Simula l'ambiente NUI FiveM per anteprima locale.
   NON includere in produzione (non è nel fxmanifest).
   ============================================================ */

(function () {
    'use strict';

    // ── Dati fittizi ────────────────────────────────────────
    const MY_NUMBER = '555-1337';

    const MOCK_CONVERSATIONS = [
        { contactNumber: '555-2000', name: 'Marco Bianchi',  online: true,  unread: 3, lastMessage: 'Ci vediamo al porto?', lastType: 'text', lastTime: new Date(Date.now()-300000).toISOString() },
        { contactNumber: '555-3001', name: 'Giulia Rossi',   online: false, unread: 0, lastMessage: 'Grazie mille!',        lastType: 'text', lastTime: new Date(Date.now()-3600000).toISOString() },
        { contactNumber: '555-4002', name: 'Don Corleone',   online: true,  unread: 1, lastMessage: '📍 Posizione',         lastType: 'location', lastTime: new Date(Date.now()-86400000).toISOString() },
        { contactNumber: '555-5555', name: 'Luca Ferrari',   online: false, unread: 0, lastMessage: 'ok gg',                lastType: 'text', lastTime: new Date(Date.now()-172800000).toISOString() },
    ];

    const MOCK_MESSAGES = {
        '555-2000': [
            { id:1, senderNumber:'555-2000', receiverNumber:MY_NUMBER, type:'text',     content:'Ciao! Come stai?',           sentAt: new Date(Date.now()-3600000).toISOString() },
            { id:2, senderNumber:MY_NUMBER,  receiverNumber:'555-2000', type:'text',     content:'Bene grazie, tu?',           sentAt: new Date(Date.now()-3500000).toISOString() },
            { id:3, senderNumber:'555-2000', receiverNumber:MY_NUMBER, type:'text',     content:'Tutto ok. Ci vediamo al porto stasera?', sentAt: new Date(Date.now()-600000).toISOString() },
            { id:4, senderNumber:'555-2000', receiverNumber:MY_NUMBER, type:'location', content:{ x:-1037.8, y:-2737.6, z:20.2, label:'Porto di LS' }, sentAt: new Date(Date.now()-300000).toISOString() },
        ],
        '555-3001': [
            { id:5, senderNumber:MY_NUMBER,  receiverNumber:'555-3001', type:'text', content:'Sto arrivando!',   sentAt: new Date(Date.now()-7200000).toISOString() },
            { id:6, senderNumber:'555-3001', receiverNumber:MY_NUMBER, type:'text', content:'Grazie mille!',     sentAt: new Date(Date.now()-3600000).toISOString() },
        ],
        '555-4002': [
            { id:7, senderNumber:'555-4002', receiverNumber:MY_NUMBER, type:'image',    content:'[immagine]',    sentAt: new Date(Date.now()-86400000).toISOString() },
            { id:8, senderNumber:'555-4002', receiverNumber:MY_NUMBER, type:'location', content:{ x:202.1, y:-940.5, z:30.7, label:'Vinewood Blvd' }, sentAt: new Date(Date.now()-85000000).toISOString() },
        ],
    };

    const MOCK_CONTACTS = [
        { id:1, name:'Marco Bianchi',  number:'555-2000', notes:'Socio di affari', online:true,  createdAt:'2025-01-10 10:00:00' },
        { id:2, name:'Giulia Rossi',   number:'555-3001', notes:'',               online:false, createdAt:'2025-02-14 09:30:00' },
        { id:3, name:'Don Corleone',   number:'555-4002', notes:'Non disturbare di notte', online:true, createdAt:'2025-03-01 18:00:00' },
        { id:4, name:'Luca Ferrari',   number:'555-5555', notes:'',               online:false, createdAt:'2025-04-20 14:00:00' },
    ];

    const MOCK_CALL_LOG = [
        { id:1, contactNumber:'555-2000', name:'Marco Bianchi', direction:'outgoing', status:'answered', duration:142, startedAt: new Date(Date.now()-3600000).toISOString() },
        { id:2, contactNumber:'555-3001', name:'Giulia Rossi',  direction:'incoming', status:'missed',   duration:0,   startedAt: new Date(Date.now()-7200000).toISOString() },
        { id:3, contactNumber:'555-9999', name:'555-9999',      direction:'incoming', status:'answered', duration:35,  startedAt: new Date(Date.now()-86400000).toISOString() },
    ];

    const MOCK_ONLINE_PLAYERS = [
        { number:'555-2000', name:'Marco Bianchi' },
        { number:'555-4002', name:'Don Corleone' },
    ];

    // ── Intercetta fetch verso https://at-phone/* ───────────
    const _originalFetch = window.fetch;
    window.fetch = async function (url, options) {
        if (typeof url === 'string' && url.startsWith('https://at-phone/')) {
            const action = url.replace('https://at-phone/', '');
            const body   = options?.body ? JSON.parse(options.body) : {};
            const result = await mockHandler(action, body);
            return new Response(JSON.stringify(result), { status: 200 });
        }
        return _originalFetch.apply(this, arguments);
    };

    // ── Gestore mock ────────────────────────────────────────
    async function mockHandler(action, payload) {
        await delay(20); // latenza minima per dev

        switch (action) {
            case 'requestPhone':
            case 'closePhone':
                return {};

            case 'getConversations':
                dispatchNUI({ type: 'conversations', data: MOCK_CONVERSATIONS });
                return {};

            case 'getMessages':
                const msgs = MOCK_MESSAGES[payload.targetNumber] || [];
                dispatchNUI({ type: 'messages', data: { targetNumber: payload.targetNumber, messages: msgs, offset: 0 } });
                return {};

            case 'sendMessage':
                const newMsg = {
                    id: Date.now(),
                    senderNumber:   MY_NUMBER,
                    receiverNumber: payload.targetNumber,
                    type:    payload.type || 'text',
                    content: payload.content,
                    sentAt:  new Date().toISOString(),
                };
                dispatchNUI({ type: 'messageSent', message: newMsg });
                // Simula risposta automatica dopo 2s
                setTimeout(() => {
                    dispatchNUI({ type: 'messageReceived', message: {
                        id: Date.now()+1,
                        senderNumber:   payload.targetNumber,
                        receiverNumber: MY_NUMBER,
                        type:    'text',
                        content: '👍',
                        sentAt:  new Date().toISOString(),
                    }});
                }, 2000);
                return {};

            case 'getContacts':
                dispatchNUI({ type: 'contacts', data: MOCK_CONTACTS });
                return {};

            case 'getOnlinePlayers':
                dispatchNUI({ type: 'onlinePlayers', data: MOCK_ONLINE_PLAYERS });
                return {};

            case 'saveContact':
                const newContact = { id: Date.now(), name: payload.name, number: payload.number, notes: payload.notes||'', online: false, createdAt: new Date().toISOString() };
                MOCK_CONTACTS.push(newContact);
                dispatchNUI({ type: 'contactSaved', contact: newContact });
                return {};

            case 'deleteContact':
                dispatchNUI({ type: 'contactDeleted', data: { id: payload.id } });
                return {};

            case 'updateContact':
                dispatchNUI({ type: 'contactUpdated', data: { id: payload.id, name: payload.name, notes: payload.notes } });
                return {};

            case 'getCallLog':
                dispatchNUI({ type: 'callLog', data: MOCK_CALL_LOG });
                return {};

            case 'startCall':
                // Simula: 2s di chiamata poi risponde
                dispatchNUI({ type: 'callRinging', data: { callId: 'mock-call-1', targetNumber: payload.targetNumber } });
                setTimeout(() => {
                    dispatchNUI({ type: 'callConnected', data: { callId: 'mock-call-1', channel: 'mock', withNumber: payload.targetNumber } });
                }, 2000);
                return {};

            case 'answerCall':
                dispatchNUI({ type: 'callConnected', data: { callId: payload.callId, channel: 'mock', withNumber: '555-2000' } });
                return {};

            case 'declineCall':
            case 'hangupCall':
                dispatchNUI({ type: 'callEnded', data: { callId: payload.callId, reason: 'hangup', duration: 0 } });
                return {};

            case 'requestLocation':
                // Risposta sincrona tramite valore di ritorno simulando callback Lua
                return { x: -1037.8, y: -2737.6, z: 20.2, label: 'Porto di LS' };

            case 'setLocationBlip':
                console.log('[mock] Blip posizione:', payload);
                return {};

            case 'markRead':
                return {};

            default:
                console.log('[mock] Azione non gestita:', action, payload);
                return {};
        }
    }

    // ── Dispatch evento NUI (simula SendNUIMessage) ─────────
    function dispatchNUI(data) {
        window.dispatchEvent(new MessageEvent('message', { data, source: window }));
    }

    function delay(ms) {
        return new Promise(r => setTimeout(r, ms));
    }

    // ── Auto-apertura telefono al caricamento ───────────────
    window.addEventListener('load', () => {
        setTimeout(() => {
            dispatchNUI({ type: 'phoneStatus', hasPhone: true, number: MY_NUMBER });
            dispatchNUI({ type: 'openPhone',   number: MY_NUMBER });
        }, 200);
    });

    console.log('%c[AT-Phone Mock] Modalità anteprima attiva — numero: ' + MY_NUMBER, 'color:#34c759;font-weight:bold');
})();
