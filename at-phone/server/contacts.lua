-- ============================================================
--  at-phone — server/contacts.lua
--  Salvataggio, cancellazione, recupero contatti.
-- ============================================================

-- ============================================================
--  at-phone:getContacts — lista contatti del telefono attivo
-- ============================================================
RegisterNetEvent('at-phone:getContacts', function()
    local source = source
    local myNumber = activePhones[source]
    if not myNumber then return end

    local rows = MySQL.query.await(
        'SELECT * FROM ' .. Config.Tables.contacts ..
        ' WHERE phone_number = ? ORDER BY name ASC',
        { myNumber }
    )

    -- Aggiunge flag online
    local contacts = {}
    for _, row in ipairs(rows or {}) do
        local isOnline = FindSourceByNumber(row.number) ~= nil
        table.insert(contacts, {
            id         = row.id,
            name       = row.name,
            number     = row.number,
            notes      = row.notes or '',
            online     = isOnline,
            createdAt  = tostring(row.created_at),
        })
    end

    TriggerClientEvent('at-phone:contacts', source, contacts)
end)

-- ============================================================
--  at-phone:saveContact
--  payload: { name, number, notes }
-- ============================================================
RegisterNetEvent('at-phone:saveContact', function(data)
    local source = source
    local myNumber = activePhones[source]

    if not myNumber then return end
    if type(data) ~= 'table' then return end

    local name   = tostring(data.name   or ''):sub(1, 60)
    local number = tostring(data.number or ''):sub(1, 10)
    local notes  = tostring(data.notes  or ''):sub(1, 500)

    if name == '' or number == '' then
        TriggerClientEvent('at-phone:contactError', source, 'Nome e numero sono obbligatori.')
        return
    end

    -- Controlla duplicato
    local existing = MySQL.scalar.await(
        'SELECT id FROM ' .. Config.Tables.contacts ..
        ' WHERE phone_number = ? AND number = ? LIMIT 1',
        { myNumber, number }
    )
    if existing then
        TriggerClientEvent('at-phone:contactError', source, 'Contatto già salvato.')
        return
    end

    local id = MySQL.insert.await(
        'INSERT INTO ' .. Config.Tables.contacts .. ' (phone_number, name, number, notes) VALUES (?, ?, ?, ?)',
        { myNumber, name, number, notes }
    )

    TriggerClientEvent('at-phone:contactSaved', source, {
        id        = id,
        name      = name,
        number    = number,
        notes     = notes,
        online    = FindSourceByNumber(number) ~= nil,
        createdAt = '',
    })
end)

-- ============================================================
--  at-phone:deleteContact
--  payload: { id }
-- ============================================================
RegisterNetEvent('at-phone:deleteContact', function(data)
    local source = source
    local myNumber = activePhones[source]

    if not myNumber then return end
    if type(data) ~= 'table' then return end

    local contactId = tonumber(data.id)
    if not contactId then return end

    -- Verifica proprietà del contatto
    local row = MySQL.query.await(
        'SELECT id FROM ' .. Config.Tables.contacts ..
        ' WHERE id = ? AND phone_number = ?',
        { contactId, myNumber }
    )
    if not row or #row == 0 then return end

    MySQL.query.await(
        'DELETE FROM ' .. Config.Tables.contacts .. ' WHERE id = ?',
        { contactId }
    )

    TriggerClientEvent('at-phone:contactDeleted', source, { id = contactId })
end)

-- ============================================================
--  at-phone:updateContact
--  payload: { id, name, notes }
-- ============================================================
RegisterNetEvent('at-phone:updateContact', function(data)
    local source = source
    local myNumber = activePhones[source]

    if not myNumber then return end
    if type(data) ~= 'table' then return end

    local contactId = tonumber(data.id)
    local name      = tostring(data.name  or ''):sub(1, 60)
    local notes     = tostring(data.notes or ''):sub(1, 500)

    if not contactId or name == '' then return end

    local row = MySQL.query.await(
        'SELECT id FROM ' .. Config.Tables.contacts ..
        ' WHERE id = ? AND phone_number = ?',
        { contactId, myNumber }
    )
    if not row or #row == 0 then return end

    MySQL.query.await(
        'UPDATE ' .. Config.Tables.contacts .. ' SET name = ?, notes = ? WHERE id = ?',
        { name, notes, contactId }
    )

    TriggerClientEvent('at-phone:contactUpdated', source, {
        id    = contactId,
        name  = name,
        notes = notes,
    })
end)
