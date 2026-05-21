fx_version 'cerulean'
game 'gta5'

name        'at-phone'
description 'Sistema telefono per FiveM — AT Phone'
author      'AT Development'
version     '1.0.0'

shared_scripts {
    'config.lua',
}

server_scripts {
    '@oxmysql/lib/MySQL.lua',
    'server/main.lua',
    'server/messages.lua',
    'server/calls.lua',
    'server/contacts.lua',
}

client_scripts {
    'client/main.lua',
}

ui_page 'ui/index.html'

files {
    'ui/index.html',
    'ui/style.css',
    'ui/app.js',
    'ui/apps/messages/index.html',
    'ui/apps/messages/messages.css',
    'ui/apps/messages/messages.js',
    'ui/apps/contacts/index.html',
    'ui/apps/contacts/contacts.css',
    'ui/apps/contacts/contacts.js',
    'ui/apps/calls/index.html',
    'ui/apps/calls/calls.css',
    'ui/apps/calls/calls.js',
}
