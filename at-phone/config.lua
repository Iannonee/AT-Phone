Config = {}

-- Formato numero: 555-XXXX
Config.NumberPrefix = '555'

-- Quanti secondi aspettare prima di considerare una chiamata senza risposta
Config.CallTimeout = 30

-- Distanza massima per la condivisione posizione blip (unità di gioco)
Config.LocationBlipTimeout = 300000 -- 5 minuti in ms

-- ============================================================
--  INVENTORY ADAPTER
--  Configura qui il tuo sistema inventario.
--  Default: standalone (tutti i giocatori hanno sempre il telefono).
-- ============================================================
Config.InventoryAdapter = {
    -- Ritorna true se il giocatore ha un telefono equipaggiato/in inventario.
    hasPhone = function(source)
        -- DEFAULT: sempre true — nessun sistema inventario.
        -- Esempio QBCore:
        --   local Player = QBCore.Functions.GetPlayer(source)
        --   return Player ~= nil and Player.Functions.GetItemByName('phone') ~= nil
        return true
    end,

    -- Ritorna l'ID univoco dell'item telefono equipaggiato.
    -- Usato per legare il numero al telefono fisico.
    getPhoneItemId = function(source)
        -- DEFAULT: usa l'identifier del giocatore (un telefono per player).
        -- Esempio QBCore con item metadata:
        --   local Player = QBCore.Functions.GetPlayer(source)
        --   local item = Player.Functions.GetItemByName('phone')
        --   return item and item.info and item.info.uniqueId or nil
        local identifiers = GetPlayerIdentifiers(source)
        return identifiers[1] or tostring(source)
    end,
}

-- ============================================================
--  DATABASE — le query usano questi nomi di tabella.
--  Non modificare se non sai cosa fai.
-- ============================================================
Config.Tables = {
    numbers  = 'phone_numbers',
    contacts = 'phone_contacts',
    messages = 'phone_messages',
    calls    = 'phone_calls',
}
