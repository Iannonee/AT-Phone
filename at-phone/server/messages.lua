-- ============================================================
--  at-phone — server/messages.lua
--  Invio/ricezione messaggi, storico conversazioni.
-- ============================================================

-- ============================================================
--  at-phone:sendMessage
--  payload: { targetNumber, type, content }
-- ============================================================
RegisterNetEvent('at-phone:sendMessage', function(data)
    local source = source
    local senderNumber = activePhones[source]

    if not senderNumber then
        TriggerClientEvent('at-phone:messageError', source, 'Nessun telefono attivo.')
        return
    end

    -- Validazione input
    if type(data) ~= 'table' then return end
    local targetNumber = tostring(data.targetNumber or '')
    local msgType      = tostring(data.type or 'text')
    local content      = data.content

    if targetNumber == '' or targetNumber == senderNumber then return end
    if not (msgType == 'text' or msgType == 'image' or msgType == 'location') then
        msgType = 'text'
    end

    -- Serializza content se è una tabella (posizione)
    local contentStr
    if type(content) == 'table' then
        contentStr = json.encode(content)
    else
        contentStr = tostring(content or '')
    end

    if #contentStr == 0 then return end
    if #contentStr > 4000 then
        TriggerClientEvent('at-phone:messageError', source, 'Messaggio troppo lungo.')
        return
    end

    -- Salva nel DB
    local msgId = MySQL.insert.await(
        'INSERT INTO ' .. Config.Tables.messages ..
        ' (sender_number, receiver_number, type, content) VALUES (?, ?, ?, ?)',
        { senderNumber, targetNumber, msgType, contentStr }
    )

    local msgObj = {
        id             = msgId,
        senderNumber   = senderNumber,
        receiverNumber = targetNumber,
        type           = msgType,
        content        = (msgType == 'location' and json.decode(contentStr)) or contentStr,
        sentAt         = os.time(),
    }

    -- Conferma al mittente
    TriggerClientEvent('at-phone:messageSent', source, msgObj)

    -- Consegna al destinatario se online
    local targetSource = FindSourceByNumber(targetNumber)
    if targetSource then
        TriggerClientEvent('at-phone:messageReceived', targetSource, msgObj)
    end
end)

-- ============================================================
--  at-phone:getConversations
--  Restituisce la lista conversazioni con ultimo messaggio
-- ============================================================
RegisterNetEvent('at-phone:getConversations', function()
    local source = source
    local myNumber = activePhones[source]
    if not myNumber then return end

    -- Ottieni tutte le conversazioni uniche
    local rows = MySQL.query.await([[
        SELECT
            CASE
                WHEN sender_number   = ? THEN receiver_number
                ELSE sender_number
            END AS contact_number,
            MAX(id) AS last_id
        FROM ]] .. Config.Tables.messages .. [[
        WHERE sender_number = ? OR receiver_number = ?
        GROUP BY contact_number
        ORDER BY last_id DESC
    ]], { myNumber, myNumber, myNumber })

    if not rows or #rows == 0 then
        TriggerClientEvent('at-phone:conversations', source, {})
        return
    end

    local conversations = {}
    for _, row in ipairs(rows) do
        local contactNumber = row.contact_number

        -- Ultimo messaggio
        local lastMsg = MySQL.query.await(
            'SELECT * FROM ' .. Config.Tables.messages ..
            ' WHERE id = ?',
            { row.last_id }
        )
        lastMsg = lastMsg and lastMsg[1]

        -- Messaggi non letti (ricevuti da questo contatto)
        local unread = MySQL.scalar.await(
            'SELECT COUNT(*) FROM ' .. Config.Tables.messages ..
            ' WHERE sender_number = ? AND receiver_number = ? AND read_at IS NULL',
            { contactNumber, myNumber }
        ) or 0

        -- Cerca il nome dai contatti salvati
        local contact = MySQL.query.await(
            'SELECT name FROM ' .. Config.Tables.contacts ..
            ' WHERE phone_number = ? AND number = ? LIMIT 1',
            { myNumber, contactNumber }
        )
        local contactName = (contact and contact[1] and contact[1].name) or contactNumber

        -- Online?
        local isOnline = FindSourceByNumber(contactNumber) ~= nil

        local lastContent = ''
        local lastType = 'text'
        if lastMsg then
            lastType = lastMsg.type or 'text'
            if lastType == 'location' then
                lastContent = '📍 Posizione'
            elseif lastType == 'image' then
                lastContent = '🖼️ Immagine'
            else
                lastContent = lastMsg.content or ''
            end
        end

        table.insert(conversations, {
            contactNumber = contactNumber,
            name          = contactName,
            online        = isOnline,
            unread        = tonumber(unread),
            lastMessage   = lastContent,
            lastType      = lastType,
            lastTime      = lastMsg and tostring(lastMsg.sent_at) or '',
        })
    end

    TriggerClientEvent('at-phone:conversations', source, conversations)
end)

-- ============================================================
--  at-phone:getMessages
--  payload: { targetNumber, offset }
-- ============================================================
RegisterNetEvent('at-phone:getMessages', function(data)
    local source = source
    local myNumber = activePhones[source]
    if not myNumber or type(data) ~= 'table' then return end

    local targetNumber = tostring(data.targetNumber or '')
    if targetNumber == '' then return end

    local offset = tonumber(data.offset) or 0
    local limit  = 50

    local rows = MySQL.query.await([[
        SELECT * FROM ]] .. Config.Tables.messages .. [[
        WHERE (sender_number = ? AND receiver_number = ?)
           OR (sender_number = ? AND receiver_number = ?)
        ORDER BY id DESC
        LIMIT ? OFFSET ?
    ]], { myNumber, targetNumber, targetNumber, myNumber, limit, offset })

    -- Marca come letti i messaggi ricevuti
    MySQL.query.await(
        'UPDATE ' .. Config.Tables.messages ..
        ' SET read_at = NOW() WHERE sender_number = ? AND receiver_number = ? AND read_at IS NULL',
        { targetNumber, myNumber }
    )

    -- Decodifica JSON per location
    local messages = {}
    for _, msg in ipairs(rows or {}) do
        local content = msg.content
        if msg.type == 'location' then
            content = json.decode(content) or content
        end
        table.insert(messages, 1, {
            id             = msg.id,
            senderNumber   = msg.sender_number,
            receiverNumber = msg.receiver_number,
            type           = msg.type,
            content        = content,
            sentAt         = tostring(msg.sent_at),
        })
    end

    TriggerClientEvent('at-phone:messages', source, {
        targetNumber = targetNumber,
        messages     = messages,
        offset       = offset,
    })
end)

-- ============================================================
--  at-phone:markRead
-- ============================================================
RegisterNetEvent('at-phone:markRead', function(data)
    local source = source
    local myNumber = activePhones[source]
    if not myNumber or type(data) ~= 'table' then return end

    local fromNumber = tostring(data.fromNumber or '')
    if fromNumber == '' then return end

    MySQL.query.await(
        'UPDATE ' .. Config.Tables.messages ..
        ' SET read_at = NOW() WHERE sender_number = ? AND receiver_number = ? AND read_at IS NULL',
        { fromNumber, myNumber }
    )
end)
