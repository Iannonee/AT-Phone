-- ============================================================
--  at-phone — server/calls.lua
--  Logica chiamate, gestione canali VOIP mumble.
-- ============================================================

-- Chiamate attive: callId → { caller, callerNumber, receiver, receiverNumber, startTime, dbId }
local activeCalls = {}
local callCounter = 0

local function nextCallId()
    callCounter = callCounter + 1
    return 'call_' .. callCounter
end

-- ============================================================
--  at-phone:startCall — il chiamante avvia una chiamata
-- ============================================================
RegisterNetEvent('at-phone:startCall', function(data)
    local source = source
    local callerNumber = activePhones[source]

    if not callerNumber then return end
    if type(data) ~= 'table' then return end

    local targetNumber = tostring(data.targetNumber or '')
    if targetNumber == '' or targetNumber == callerNumber then return end

    -- Controlla se il chiamante è già in una chiamata
    for _, call in pairs(activeCalls) do
        if call.caller == source or call.receiver == source then
            TriggerClientEvent('at-phone:callError', source, 'Sei già in una chiamata.')
            return
        end
    end

    -- Trova il destinatario
    local targetSource = FindSourceByNumber(targetNumber)
    if not targetSource then
        -- Log chiamata persa
        MySQL.insert.await(
            'INSERT INTO ' .. Config.Tables.calls ..
            ' (caller_number, receiver_number, status) VALUES (?, ?, ?)',
            { callerNumber, targetNumber, 'missed' }
        )
        TriggerClientEvent('at-phone:callFailed', source, { reason = 'offline', targetNumber = targetNumber })
        return
    end

    -- Controlla se il destinatario è già in una chiamata
    for _, call in pairs(activeCalls) do
        if call.caller == targetSource or call.receiver == targetSource then
            TriggerClientEvent('at-phone:callFailed', source, { reason = 'busy', targetNumber = targetNumber })
            return
        end
    end

    -- Cerca nome contatto del chiamante sul telefono del destinatario
    local callerContact = MySQL.query.await(
        'SELECT name FROM ' .. Config.Tables.contacts ..
        ' WHERE phone_number = ? AND number = ? LIMIT 1',
        { targetNumber, callerNumber }
    )
    local callerName = (callerContact and callerContact[1] and callerContact[1].name) or callerNumber

    local callId = nextCallId()

    -- Salva sul DB
    local dbId = MySQL.insert.await(
        'INSERT INTO ' .. Config.Tables.calls ..
        ' (caller_number, receiver_number, status) VALUES (?, ?, ?)',
        { callerNumber, targetNumber, 'missed' }
    )

    activeCalls[callId] = {
        caller        = source,
        callerNumber  = callerNumber,
        receiver      = targetSource,
        receiverNumber = targetNumber,
        startTime     = os.time(),
        dbId          = dbId,
        answered      = false,
    }

    -- Notifica chiamante
    TriggerClientEvent('at-phone:callRinging', source, {
        callId       = callId,
        targetNumber = targetNumber,
    })

    -- Notifica destinatario — chiamata in arrivo
    TriggerClientEvent('at-phone:incomingCall', targetSource, {
        callId       = callId,
        callerNumber = callerNumber,
        callerName   = callerName,
    })

    -- Timeout: se non risponde entro Config.CallTimeout secondi → missed
    SetTimeout(Config.CallTimeout * 1000, function()
        local call = activeCalls[callId]
        if not call or call.answered then return end

        -- Cancella chiamata
        activeCalls[callId] = nil
        MySQL.query.await(
            'UPDATE ' .. Config.Tables.calls .. ' SET status = ?, ended_at = NOW() WHERE id = ?',
            { 'missed', dbId }
        )

        TriggerClientEvent('at-phone:callEnded', source,      { callId = callId, reason = 'timeout' })
        TriggerClientEvent('at-phone:callEnded', targetSource, { callId = callId, reason = 'timeout' })
    end)
end)

-- ============================================================
--  at-phone:answerCall — il destinatario risponde
-- ============================================================
RegisterNetEvent('at-phone:answerCall', function(data)
    local source = source
    if type(data) ~= 'table' then return end

    local callId = tostring(data.callId or '')
    local call   = activeCalls[callId]

    if not call or call.receiver ~= source then return end

    call.answered  = true
    call.startTime = os.time()

    -- Aggiorna DB
    MySQL.query.await(
        'UPDATE ' .. Config.Tables.calls .. ' SET status = ?, started_at = NOW() WHERE id = ?',
        { 'answered', call.dbId }
    )

    -- Crea canale mumble dedicato
    local channelName = callId
    MumbleCreateChannel(channelName)

    -- Notifica entrambi per entrare nel canale
    TriggerClientEvent('at-phone:callConnected', call.caller, {
        callId      = callId,
        channel     = channelName,
        withNumber  = call.receiverNumber,
    })
    TriggerClientEvent('at-phone:callConnected', call.receiver, {
        callId      = callId,
        channel     = channelName,
        withNumber  = call.callerNumber,
    })
end)

-- ============================================================
--  at-phone:declineCall — il destinatario rifiuta
-- ============================================================
RegisterNetEvent('at-phone:declineCall', function(data)
    local source = source
    if type(data) ~= 'table' then return end

    local callId = tostring(data.callId or '')
    local call   = activeCalls[callId]

    if not call then return end
    if call.receiver ~= source and call.caller ~= source then return end

    activeCalls[callId] = nil

    MySQL.query.await(
        'UPDATE ' .. Config.Tables.calls .. ' SET status = ?, ended_at = NOW() WHERE id = ?',
        { 'declined', call.dbId }
    )

    TriggerClientEvent('at-phone:callEnded', call.caller,   { callId = callId, reason = 'declined' })
    TriggerClientEvent('at-phone:callEnded', call.receiver, { callId = callId, reason = 'declined' })
end)

-- ============================================================
--  at-phone:hangupCall — uno dei due riaggancia
-- ============================================================
RegisterNetEvent('at-phone:hangupCall', function(data)
    local source = source
    if type(data) ~= 'table' then return end

    local callId = tostring(data.callId or '')
    local call   = activeCalls[callId]

    if not call then return end
    if call.caller ~= source and call.receiver ~= source then return end

    local duration = call.answered and (os.time() - call.startTime) or 0
    activeCalls[callId] = nil

    MySQL.query.await(
        'UPDATE ' .. Config.Tables.calls ..
        ' SET ended_at = NOW(), duration = ?, status = ? WHERE id = ?',
        { duration, call.answered and 'answered' or 'missed', call.dbId }
    )

    -- Distruggi canale mumble
    if call.answered then
        MumbleRemoveAllFromChannel(callId)
    end

    TriggerClientEvent('at-phone:callEnded', call.caller,   { callId = callId, reason = 'hangup', duration = duration })
    TriggerClientEvent('at-phone:callEnded', call.receiver, { callId = callId, reason = 'hangup', duration = duration })
end)

-- ============================================================
--  Gestione disconnessione durante chiamata
-- ============================================================
AddEventHandler('at-phone:internal:playerDropped', function(source)
    for callId, call in pairs(activeCalls) do
        if call.caller == source or call.receiver == source then
            local duration = call.answered and (os.time() - call.startTime) or 0

            MySQL.query.await(
                'UPDATE ' .. Config.Tables.calls ..
                ' SET ended_at = NOW(), duration = ?, status = ? WHERE id = ?',
                { duration, call.answered and 'answered' or 'missed', call.dbId }
            )

            if call.answered then
                MumbleRemoveAllFromChannel(callId)
            end

            local other = (call.caller == source) and call.receiver or call.caller
            TriggerClientEvent('at-phone:callEnded', other, { callId = callId, reason = 'disconnected' })

            activeCalls[callId] = nil
        end
    end
end)

-- ============================================================
--  at-phone:getCallLog — storico chiamate
-- ============================================================
RegisterNetEvent('at-phone:getCallLog', function()
    local source = source
    local myNumber = activePhones[source]
    if not myNumber then return end

    local rows = MySQL.query.await([[
        SELECT c.*,
            CASE
                WHEN c.caller_number = ? THEN c.receiver_number
                ELSE c.caller_number
            END AS contact_number,
            CASE
                WHEN c.caller_number = ? THEN 'outgoing'
                ELSE 'incoming'
            END AS direction
        FROM ]] .. Config.Tables.calls .. [[ c
        WHERE c.caller_number = ? OR c.receiver_number = ?
        ORDER BY c.id DESC
        LIMIT 50
    ]], { myNumber, myNumber, myNumber, myNumber })

    -- Risolvi i nomi dai contatti
    local log = {}
    for _, row in ipairs(rows or {}) do
        local contact = MySQL.query.await(
            'SELECT name FROM ' .. Config.Tables.contacts ..
            ' WHERE phone_number = ? AND number = ? LIMIT 1',
            { myNumber, row.contact_number }
        )
        table.insert(log, {
            id            = row.id,
            contactNumber = row.contact_number,
            name          = (contact and contact[1] and contact[1].name) or row.contact_number,
            direction     = row.direction,
            status        = row.status,
            duration      = row.duration,
            startedAt     = tostring(row.started_at),
        })
    end

    TriggerClientEvent('at-phone:callLog', source, log)
end)
