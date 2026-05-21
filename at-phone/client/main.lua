-- ============================================================
--  at-phone — client/main.lua
--  Keybind, NUI focus, bridge eventi server ↔ UI.
-- ============================================================

local isPhoneOpen   = false
local hasActivePhone = false
local myPhoneNumber  = nil
local activeCallId   = nil
local activeCallChannel = nil

-- ============================================================
--  Richiedi stato telefono al server all'avvio
-- ============================================================
AddEventHandler('onClientResourceStart', function(resourceName)
    if resourceName ~= GetCurrentResourceName() then return end
    TriggerServerEvent('at-phone:requestPhone')
end)

-- ============================================================
--  Risposta del server allo stato telefono
-- ============================================================
RegisterNetEvent('at-phone:phoneStatus', function(data)
    hasActivePhone  = data.hasPhone
    myPhoneNumber   = data.number

    SendNUIMessage({
        type   = 'phoneStatus',
        hasPhone = hasActivePhone,
        number   = myPhoneNumber,
    })

    -- Se il telefono viene rimosso mentre è aperto, chiudi l'UI
    if not hasActivePhone and isPhoneOpen then
        closePhone()
    end
end)

-- ============================================================
--  Keybind F2 — apri/chiudi telefono
-- ============================================================
RegisterKeyMapping('openphone', 'Apri telefono', 'keyboard', 'F2')

RegisterCommand('openphone', function()
    if not hasActivePhone then return end

    if isPhoneOpen then
        closePhone()
    else
        openPhone()
    end
end, false)

function openPhone()
    isPhoneOpen = true
    SendNUIMessage({ type = 'openPhone', number = myPhoneNumber })
    SetNuiFocus(true, true)
end

function closePhone()
    isPhoneOpen = false
    SendNUIMessage({ type = 'closePhone' })
    SetNuiFocus(false, false)
end

-- ============================================================
--  NUI Callbacks — dal browser al server
-- ============================================================
RegisterNUICallback('closePhone', function(data, cb)
    closePhone()
    cb({})
end)

RegisterNUICallback('sendMessage', function(data, cb)
    TriggerServerEvent('at-phone:sendMessage', data)
    cb({})
end)

RegisterNUICallback('getConversations', function(data, cb)
    TriggerServerEvent('at-phone:getConversations')
    cb({})
end)

RegisterNUICallback('getMessages', function(data, cb)
    TriggerServerEvent('at-phone:getMessages', data)
    cb({})
end)

RegisterNUICallback('markRead', function(data, cb)
    TriggerServerEvent('at-phone:markRead', data)
    cb({})
end)

RegisterNUICallback('startCall', function(data, cb)
    TriggerServerEvent('at-phone:startCall', data)
    cb({})
end)

RegisterNUICallback('answerCall', function(data, cb)
    TriggerServerEvent('at-phone:answerCall', data)
    cb({})
end)

RegisterNUICallback('declineCall', function(data, cb)
    TriggerServerEvent('at-phone:declineCall', data)
    cb({})
end)

RegisterNUICallback('hangupCall', function(data, cb)
    TriggerServerEvent('at-phone:hangupCall', data)
    cb({})
end)

RegisterNUICallback('getContacts', function(data, cb)
    TriggerServerEvent('at-phone:getContacts')
    cb({})
end)

RegisterNUICallback('saveContact', function(data, cb)
    TriggerServerEvent('at-phone:saveContact', data)
    cb({})
end)

RegisterNUICallback('deleteContact', function(data, cb)
    TriggerServerEvent('at-phone:deleteContact', data)
    cb({})
end)

RegisterNUICallback('updateContact', function(data, cb)
    TriggerServerEvent('at-phone:updateContact', data)
    cb({})
end)

RegisterNUICallback('getCallLog', function(data, cb)
    TriggerServerEvent('at-phone:getCallLog')
    cb({})
end)

RegisterNUICallback('getOnlinePlayers', function(data, cb)
    TriggerServerEvent('at-phone:getOnlinePlayers')
    cb({})
end)

-- Condivisione posizione: gestita client-side, nessun round-trip server
RegisterNUICallback('requestLocation', function(data, cb)
    local ped   = PlayerPedId()
    local coords = GetEntityCoords(ped)

    local streetHash, crossingHash = GetStreetNameAtCoord(coords.x, coords.y, coords.z)
    local streetName = GetStreetNameFromHashKey(streetHash)

    cb({
        x     = coords.x,
        y     = coords.y,
        z     = coords.z,
        label = streetName or 'Posizione sconosciuta',
    })
end)

-- ============================================================
--  Piazza blip sulla mappa quando l'utente tocca una posizione
-- ============================================================
local locationBlip = nil

RegisterNUICallback('setLocationBlip', function(data, cb)
    if locationBlip then
        RemoveBlip(locationBlip)
        locationBlip = nil
    end

    if data and data.x then
        locationBlip = AddBlipForCoord(data.x, data.y, data.z)
        SetBlipSprite(locationBlip, 1)
        SetBlipColour(locationBlip, 2)  -- verde
        SetBlipScale(locationBlip, 0.9)
        SetBlipAsShortRange(locationBlip, false)
        BeginTextCommandSetBlipName('STRING')
        AddTextComponentString(data.label or 'Posizione condivisa')
        EndTextCommandSetBlipName(locationBlip)

        -- Rimuovi dopo timeout
        SetTimeout(Config.LocationBlipTimeout, function()
            if locationBlip then
                RemoveBlip(locationBlip)
                locationBlip = nil
            end
        end)
    end

    cb({})
end)

-- ============================================================
--  Events server → client → NUI
-- ============================================================

-- Messaggi
RegisterNetEvent('at-phone:messageSent', function(msg)
    SendNUIMessage({ type = 'messageSent', message = msg })
end)

RegisterNetEvent('at-phone:messageReceived', function(msg)
    SendNUIMessage({ type = 'messageReceived', message = msg })
end)

RegisterNetEvent('at-phone:messageError', function(err)
    SendNUIMessage({ type = 'messageError', error = err })
end)

RegisterNetEvent('at-phone:conversations', function(data)
    SendNUIMessage({ type = 'conversations', data = data })
end)

RegisterNetEvent('at-phone:messages', function(data)
    SendNUIMessage({ type = 'messages', data = data })
end)

-- Contatti
RegisterNetEvent('at-phone:contacts', function(data)
    SendNUIMessage({ type = 'contacts', data = data })
end)

RegisterNetEvent('at-phone:contactSaved', function(data)
    SendNUIMessage({ type = 'contactSaved', contact = data })
end)

RegisterNetEvent('at-phone:contactDeleted', function(data)
    SendNUIMessage({ type = 'contactDeleted', data = data })
end)

RegisterNetEvent('at-phone:contactUpdated', function(data)
    SendNUIMessage({ type = 'contactUpdated', data = data })
end)

RegisterNetEvent('at-phone:contactError', function(err)
    SendNUIMessage({ type = 'contactError', error = err })
end)

-- Giocatori online
RegisterNetEvent('at-phone:onlinePlayers', function(data)
    SendNUIMessage({ type = 'onlinePlayers', data = data })
end)

-- ============================================================
--  Chiamate
-- ============================================================

RegisterNetEvent('at-phone:callRinging', function(data)
    activeCallId = data.callId
    SendNUIMessage({ type = 'callRinging', data = data })

    -- Apri il telefono se non è già aperto
    if not isPhoneOpen and hasActivePhone then
        openPhone()
    end
end)

RegisterNetEvent('at-phone:incomingCall', function(data)
    activeCallId = data.callId
    SendNUIMessage({ type = 'incomingCall', data = data })

    if not isPhoneOpen and hasActivePhone then
        openPhone()
    end
end)

RegisterNetEvent('at-phone:callConnected', function(data)
    activeCallId      = data.callId
    activeCallChannel = data.channel

    -- Entra nel canale mumble
    MumbleSetAudioInput(true)
    NetworkSetVoiceChannel(data.channel)

    SendNUIMessage({ type = 'callConnected', data = data })
end)

RegisterNetEvent('at-phone:callEnded', function(data)
    -- Esci dal canale mumble
    if activeCallChannel then
        NetworkClearVoiceChannel()
        MumbleSetAudioInput(false)
        activeCallChannel = nil
    end
    activeCallId = nil

    SendNUIMessage({ type = 'callEnded', data = data })
end)

RegisterNetEvent('at-phone:callFailed', function(data)
    SendNUIMessage({ type = 'callFailed', data = data })
end)

RegisterNetEvent('at-phone:callError', function(err)
    SendNUIMessage({ type = 'callError', error = err })
end)

RegisterNetEvent('at-phone:callLog', function(data)
    SendNUIMessage({ type = 'callLog', data = data })
end)
