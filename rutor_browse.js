(function() { 'use strict'; Lampa.Lang.add({ pirate_store: { ru: "Пиратские плагины", en: "Pirate Store", uk: "Піратські плагіни", be: "Пірацкія плагіны", zh: "盜版插件", pt: "Pirate Store", bg: "Пиратски добавки", he: "תוספים פיראטיים" } }); function addStore() { if (Lampa.Settings.main && !Lampa.Settings.main().render().find('[data-component="pirate_store"]').length) { var field = "
\n\t\t\t
\n\t\t\t\t\n\t\t\t
\n\t\t\t
"+Lampa.Lang.translate('pirate_store')+"
\n\t\t
"; Lampa.Settings.main().render().find('[data-component="more"]').after(field); Lampa.Settings.main().update(); } } Lampa.Settings.listener.follow('open', function(e) { if (e.name == 'main') { e.body.find('[data-component="pirate_store"]').on('hover:enter', function() { Lampa.Extensions.show({ store: 'https://skaztv.online/extensions.json', with_installed: true }); }); } }); if (window.appready) addStore(); else { Lampa.Listener.follow('app', function(e) { if (e.type == 'ready') addStore(); }); } })();
