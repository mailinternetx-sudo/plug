(function() {
    'use strict';

    if (window.rutori_plugin_installed) return;
    window.rutori_plugin_installed = true;

    console.log('%c🚀 RUTORI Plugin v2.0 загружен и полностью обновлён (апрель 2026)', 'color: #00ff00; font-weight: bold; background: #000; padding: 2px 5px; border-radius: 3px;');

    // ====================== КАТЕГОРИИ (точно по твоему запросу) =========================
    var categories = [
        { id: 0, title: 'Топ торренты за последние 24 часа', url: 'https://rutor.info/top' },           // обновил на реальный топ
        { id: 1, title: 'Зарубежные фильмы',                  url: 'https://rutor.info/browse/5/1/0/0' },
        { id: 2, title: 'Наши фильмы',                       url: 'https://rutor.info/browse/1/1/0/0' },
        { id: 3, title: 'Зарубежные сериалы',                url: 'https://rutor.info/browse/4/1/0/0' },
        { id: 4, title: 'Наши сериалы',                      url: 'https://rutor.info/browse/2/1/0/0' },
        { id: 5, title: 'Телевизор',                         url: 'https://rutor.info/browse/7/1/0/0' }
    ];

    // ====================== ОСНОВНОЙ КОМПОНЕНТ =========================
    var RutoriComponent = function() {
        var self = this;
        var network = new Lampa.Network();
        var scroll = new Lampa.Scroll({ mask: true, over: true });
        var tabs = new Lampa.Tabs();

        self.create = function() {
            self.render = $('<div class="rutori-main"></div>');

            // Табы
            categories.forEach(function(cat) {
                tabs.add({ title: cat.title, id: cat.id });
            });

            tabs.onSelect = function(tab) {
                loadCategory(tab.id);
            };

            self.render.append(tabs.render());
            self.render.append(scroll.render());

            return self.render;
        };

        self.start = function() {
            tabs.active(0);
        };

        self.destroy = function() {
            network.clear();
            scroll.destroy();
        };

        // ====================== ЗАГРУЗКА КАТЕГОРИИ =========================
        function loadCategory(id) {
            var cat = categories.find(function(c) { return c.id === id; });
            scroll.clear();
            scroll.append(Lampa.Template.get('loader', {}));

            network.silent({
                url: cat.url,
                dataType: 'text',
                success: function(html) {
                    scroll.clear();
                    var items = parseRutor(html);
                    if (items.length === 0) {
                        scroll.append('<div class="rutori-empty">Ничего не найдено в этой категории</div>');
                        return;
                    }

                    items.forEach(function(item) {
                        var card = createCard(item);
                        scroll.append(card);
                    });
                },
                error: function() {
                    scroll.clear();
                    scroll.append('<div class="rutori-empty">Ошибка загрузки rutor.info<br>Проверьте интернет или TorrServer</div>');
                }
            });
        }

        // ====================== НОВЫЙ ПАРСЕР (актуален на 2026 год) =========================
        function parseRutor(html) {
            var items = [];
            // Берём все строки таблицы
            var rows = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];

            rows.forEach(function(row) {
                // ID раздачи
                var idMatch = row.match(/\/torrent\/(\d+)/i);
                if (!idMatch) return;
                var id = idMatch[1];

                // Название
                var titleMatch = row.match(/<a href="\/torrent\/\d+[^>]*>([^<]+)<\/a>/i);
                if (!titleMatch) return;
                var title = titleMatch[1]
                    .trim()
                    .replace(/&nbsp;/g, ' ')
                    .replace(/^\[|\]$/g, '')
                    .trim();

                var torrentUrl = 'https://rutor.info/download/' + id + '.torrent';

                // Размер
                var sizeMatch = row.match(/([\d.,]+)\s*(GB|MB|KB|ГБ|МБ)/i);
                var size = sizeMatch ? sizeMatch[0].toUpperCase() : '—';

                // Сиды (берём первое число из пары сиды/личеры)
                var seedsMatch = row.match(/(\d+)\s+\d+/i);
                var seeds = seedsMatch ? seedsMatch[1] : '0';

                items.push({
                    title: title,
                    torrent_url: torrentUrl,
                    size: size,
                    seeds: parseInt(seeds) || 0
                });
            });

            // Ограничиваем количество (чтобы не перегружать)
            return items.slice(0, 60);
        }

        // ====================== КАРТОЧКА =========================
        function createCard(item) {
            var cardHtml = Lampa.Template.get('card', {
                title: item.title.length > 65 ? item.title.substring(0, 62) + '...' : item.title,
                poster: '',
                quality: item.size,
                info: '↑ <span style="color:#0f0">' + item.seeds + '</span>'
            });

            var card = $(cardHtml);

            card.on('hover:enter', function() {
                playTorrent(item);
            });

            // Дополнительный hover эффект
            card.on('hover:focus', function() {
                card.addClass('card--focus');
            }).on('hover:blur', function() {
                card.removeClass('card--focus');
            });

            return card;
        }

        // ====================== ВОСПРОИЗВЕДЕНИЕ (TorrServer) =========================
        function playTorrent(item) {
            Lampa.Activity.push({
                component: 'player',
                url: item.torrent_url,
                title: item.title,
                poster: '',
                playlist: [{
                    url: item.torrent_url,
                    title: item.title,
                    subtitles: []
                }]
            });

            console.log('%c▶️ Запуск: ' + item.title, 'color: #00ff00');
        }

        return self;
    };

    // ====================== РЕГИСТРАЦИЯ =========================
    Lampa.Component.add('rutori', RutoriComponent);

    // ====================== КНОПКА В ЛЕВОМ МЕНЮ =========================
    function addMenuButton(activityRender) {
        if (activityRender.find('.rutori-menu-btn').length > 0) return;

        var menuList = activityRender.find('.menu__list, .sidebar__list, .activity__menu, .main-menu__list, .menu__body');
        if (!menuList.length) menuList = activityRender.find('.activity__body');

        var btn = $(
            '<div class="menu__item rutori-menu-btn">' +
                '<div class="menu__icon" style="font-size:28px">📼</div>' +
                '<div class="menu__name">RUTORI</div>' +
            '</div>'
        );

        btn.on('hover:enter', function() {
            Lampa.Activity.push({
                component: 'rutori',
                title: 'RUTORI — Торренты с rutor.info'
            });
        });

        menuList.append(btn);
    }

    // Следим за главным экраном
    Lampa.Listener.follow('main', function(e) {
        if (e.type === 'complite') {
            addMenuButton(e.render || (e.activity && e.activity.render()));
        }
    });

    // Если уже на главном экране
    try {
        var active = Lampa.Activity.active();
        if (active && active.component === 'main') {
            addMenuButton(active.activity.render());
        }
    } catch (e) {}

    console.log('%c✅ RUTORI полностью готов! Кнопка в левом меню + воспроизведение через TorrServer', 'color: #00ff00');
})();
