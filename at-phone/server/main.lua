-- ============================================================
--  at-phone — server/main.lua
--  Gestione connessioni, numeri di telefono, tabelle DB.
-- ============================================================

-- Mappa source → numero attivo
activePhones = {}

-- ============================================================
--  Setup database on resource start
-- ============================================================
AddEventHandler('onResourceStart', function(resourceName)
    if resourceName ~= GetCurrentResourceName() then return end

    MySQL.query([[
        CREATE TABLE IF NOT EXISTS phone_numbers (
            item_id    VARCHAR(60) PRIMARY KEY,
            number     VARCHAR(10) NOT NULL UNIQUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ]])

    MySQL.query([[
        CREATE TABLE IF NOT EXISTS phone_contacts (
            id           INT AUTO_INCREMENT PRIMARY KEY,
            phone_number VARCHAR(10) NOT NULL,
            name         VARCHAR(60) NOT NULL,
            number       VARCHAR(10) NOT NULL,
            notes        TEXT,
            created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_phone (phone_number)
        )
    ]])

    MySQL.query([[
        CREATE TABLE IF NOT EXISTS phone_messages (
            id               INT AUTO_INCREMENT PRIMARY KEY,
            sender_number    VARCHAR(10) NOT NULL,
            receiver_number  VARCHAR(10) NOT NULL,
            type             VARCHAR(20) DEFAULT 'text',
            content          TEXT,
            sent_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            read_at          TIMESTAMP NULL,
            INDEX idx_sender   (sender_number),
            INDEX idx_receiver (receiver_number)
        )
    ]])

    MySQL.query([[
        CREATE TABLE IF NOT EXISTS phone_calls (
            id               INT AUTO_INCREMENT PRIMARY KEY,
            caller_number    VARCHAR(10) NOT NULL,
            receiver_number  VARCHAR(10) NOT NULL,
            started_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            ended_at         TIMESTAMP NULL,
            duration         INT DEFAULT 0,
            status           VARCHAR(20) DEFAULT 'missed',
            INDEX idx_caller   (caller_number),
            INDEX idx_receiver (receiver_number)
        )
    ]])

    print('[at-phone] Tabelle database verificate.')
end)

-- ============================================================
--  Genera un numero 555-XXXX univoco
-- ============================================================
local function generateNumber()
    local attempts = 0
    while attempts < 100 do
        local suffix = math.random(1000, 9999)
        local number = Config.NumberPrefix .. '-' .. suffix

        local existing = MySQL.scalar.await('SELECT number FROM ' .. Config.Tables.numbers .. ' WHERE number = ?', { number })
        if not existing then
            return number
        end
        attempts = attempts + 1
    end
    -- Fallback ultra-raro
    return Config.NumberPrefix .. '-' .. math.random(10000, 99999)
end

-- ============================================================
--  Recupera o assegna un numero a un item_id
-- ============================================================
local function getOrCreateNumber(itemId)
    local existing = MySQL.scalar.await(
        'SELECT number FROM ' .. Config.Tables.numbers .. ' WHERE item_id = ?',
        { itemId }
    )
    if existing then return existing end

    local newNumber = generateNumber()
    MySQL.insert.await(
        'INSERT INTO ' .. Config.Tables.numbers .. ' (item_id, number) VALUES (?, ?)',
        { itemId, newNumber }
    )
    return newNumber
end

-- ============================================================
--  Esportazioni server — usate dagli altri moduli
-- ============================================================
function GetActivePhoneNumber(source)
    return activePhones[source]
end

function FindSourceByNumber(targetNumber)
    for src, num in pairs(activePhones) do
        if num == targetNumber then
            return tonumber(src)
        end
    end
    return nil
end

-- ============================================================
--  Player connect: assegna numero se ha il telefono
-- ============================================================
AddEventHandler('playerConnecting', function(name, setKickReason, deferrals)
    -- Il numero viene assegnato quando il client richiede l'apertura del telefono
end)

-- ============================================================
--  at-phone:requestPhone — il client chiede il suo numero attivo
-- ============================================================
RegisterNetEvent('at-phone:requestPhone', function()
    local source = source

    -- Verifica adapter inventario
    local hasPhone = Config.InventoryAdapter.hasPhone(source)
    if not hasPhone then
        TriggerClientEvent('at-phone:phoneStatus', source, { hasPhone = false, number = nil })
        return
    end

    local itemId = Config.InventoryAdapter.getPhoneItemId(source)
    if not itemId then
        TriggerClientEvent('at-phone:phoneStatus', source, { hasPhone = false, number = nil })
        return
    end

    local number = getOrCreateNumber(tostring(itemId))
    activePhones[source] = number

    TriggerClientEvent('at-phone:phoneStatus', source, { hasPhone = true, number = number })
    print('[at-phone] ' .. GetPlayerName(source) .. ' usa il numero ' .. number)
end)

-- ============================================================
--  at-phone:equipPhone — inventario notifica equipaggiamento
-- ============================================================
RegisterNetEvent('at-phone:equipPhone', function(itemId)
    local source = source
    if not itemId then return end

    local number = getOrCreateNumber(tostring(itemId))
    activePhones[source] = number

    TriggerClientEvent('at-phone:phoneStatus', source, { hasPhone = true, number = number })
end)

-- ============================================================
--  at-phone:unequipPhone — inventario notifica rimozione
-- ============================================================
RegisterNetEvent('at-phone:unequipPhone', function()
    local source = source
    activePhones[source] = nil
    TriggerClientEvent('at-phone:phoneStatus', source, { hasPhone = false, number = nil })
end)

-- ============================================================
--  Pulizia alla disconnessione
-- ============================================================
AddEventHandler('playerDropped', function(reason)
    local source = source
    if activePhones[source] then
        -- Termina eventuali chiamate attive
        TriggerEvent('at-phone:internal:playerDropped', source)
        activePhones[source] = nil
    end
end)

-- ============================================================
--  at-phone:getOnlinePlayers — lista giocatori online con numero
-- ============================================================
RegisterNetEvent('at-phone:getOnlinePlayers', function()
    local source = source
    local myNumber = activePhones[source]
    if not myNumber then return end

    local result = {}
    for src, num in pairs(activePhones) do
        if tonumber(src) ~= tonumber(source) then
            table.insert(result, {
                number = num,
                name   = GetPlayerName(src),
            })
        end
    end

    TriggerClientEvent('at-phone:onlinePlayers', source, result)
end)
