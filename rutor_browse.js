(function () {
    'use strict';

    // ================================================
    // Плагин V10 v3 для Lampa TV (полная совместимость с TorrServer)
    // Добавляет кнопку "V10 v3" в левое главное меню
    // При нажатии — категории с rutor.info + прямое воспроизведение торрентов
    // ES5+ (работает в Lampa TV)
    // ================================================

    // ================= НАСТРОЙКИ =================
    var PROXY = 'https://corsproxy.io/?'; 
    // Если списки не грузятся (пустой экран / ошибка в консоли):
    // 1. Замените на другой прокси, например: 'https://api.allorigins.win/raw?url='
    // 2. Или удалите PROXY полностью (оставьте '') — если у вас нет блокировок
    // 3. Перезапустите Lampa после изменения

    var CATEGORIES = [
        { name: 'Топ торренты за последние 24 часа', url: 'https://rutor.info/top' },
        { name: 'Зарубежные фильмы', url: 'https://rutor.info/browse/155/1/0/0' },
        { name: 'Наши фильмы', url: 'https://rutor.info/browse/156/1/0/0' },
        { name: 'Зарубежные сериалы', url: 'https://rutor.info/browse/157/1/0/0' },
        { name: 'Наши сериалы', url: 'https://rutor.info/browse/158/1/0/0' },
        { name: 'Телевизор', url: 'https://rutor.info/browse/159/1/0/0' }
    ];

    // ================================================
    // Парсинг списка торрентов с rutor.info
    // ================================================
    function parseTorrents(html) {
        var items = [];
        // Регулярка для строк таблицы rutor (работает на 2026 год)
        var rowRegex = /<tr[^>]*>[\s\S]*?<a href="\/torrent\/(\d+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/tr>/gi;
        var match;

        while ((match = rowRegex.exec(html)) !== null) {
            var id = match[1];
            var titleRaw = match[2].replace(/<[^>]+>/g, '').trim();
            var torrentUrl = 'https://rutor.info/download/' + id + '.torrent';

            // Убираем лишние теги и переносы
            var title = titleRaw.replace(/\n/g, ' ').replace(/\s+/g, ' ');

            items.push({
                title: title,
                poster: '',                    // rutor не даёт постеры в списке — Lampa покажет текстовую карточку
                torrent: torrentUrl,           // Прямая ссылка на .torrent — TorrServer откроет
                description: 'Торрент с rutor.info',
                year: '',
                info: 'Rutor • ' + CATEGORIES[items.length % CATEGORIES.length].name
            });
        }

        // Ограничиваем количество (производительность TV)
        return items.slice(0, 60);
    }

    // ================================================
    // Основная функция плагина
    // ================================================
    function startPlugin() {
        console.log('%cПлагин V10 v3 загружен ✓', 'color:#00ff00;font-weight:bold');

        // Добавляем кнопку в левое главное меню
        Lampa.Listener.follow('menu', function (e) {
            if (e.type !== 'complite' && e.type !== 'update') return;

            var menuContainer = e.object.activity.render().find('.menu__list, .left__menu, .sidebar__list, .menu-list');
            if (menuContainer.length === 0) return;

            // Защита от дублирования
            if (menuContainer.find('.v10-v3-btn').length > 0) return;

            var btnHTML = 
                '<div class="menu__item selector v10-v3-btn">' +
                    '<div class="menu__ico"><span style="font-size:22px;line-height:1">V</span></div>' +
                    '<div class="menu__text">V10 v3</div>' +
                '</div>';

            var btn = $(btnHTML);

            btn.on('hover:enter', function () {
                Lampa.Activity.push({
                    component: 'v10_v3',
                    title: 'V10 v3 — Rutor.info',
                    page: 1
                });
            });

            menuContainer.append(btn);
        });

        // ================= КОМПОНЕНТ =================
        var V10Component = {
            activity: null,

            onStart: function (data) {
                this.activity = data.activity;
                var body = this.activity.render().html(
                    '<div class="activity__body" style="padding:1.2em 0">' +
                        '<div id="v10-tabs" style="margin-bottom:1.5em"></div>' +
                        '<div id="v10-list" class="items-line"></div>' +
                    '</div>'
                );

                this.buildTabs();
                this.loadCategory(0); // первая категория по умолчанию
            },

            buildTabs: function () {
                var tabsHTML = '<div class="tabs__list" style="display:flex;flex-wrap:wrap;gap:8px">';
                CATEGORIES.forEach(function (cat, i) {
                    tabsHTML += 
                        '<div class="tabs__item selector" data-index="' + i + '" ' +
                        'style="padding:8px 16px;border-radius:8px;background:#222;color:#fff">' + 
                        cat.name + '</div>';
                });
                tabsHTML += '</div>';

                $('#v10-tabs').html(tabsHTML);

                var self = this;
                $('#v10-tabs .tabs__item').on('hover:enter', function () {
                    var idx = parseInt($(this).attr('data-index'));
                    self.loadCategory(idx);
                });
            },

            loadCategory: function (index) {
                var cat = CATEGORIES[index];
                var fullUrl = PROXY ? PROXY + encodeURIComponent(cat.url) : cat.url;

                var listContainer = $('#v10-list');
                listContainer.html('<div class="spinner" style="margin:2em auto"></div>');

                Lampa.Network.silent(fullUrl, function (html) {
                    var torrents = parseTorrents(html);

                    if (torrents.length === 0) {
                        listContainer.html('<div class="empty" style="text-align:center;padding:3em;color:#888">Ничего не найдено в категории</div>');
                        return;
                    }

                    var cardsHTML = '';
                    torrents.forEach(function (item) {
                        var card = Lampa.Template.get('card', {
                            title: item.title,
                            poster: item.poster || '',
                            description: item.description,
                            info: item.info
                        });

                        var $card = $(card);
                        $card.on('hover:enter', function () {
                            // Прямое открытие торрента через TorrServer
                            Lampa.Torrent.open({
                                title: item.title,
                                torrent: item.torrent,
                                poster: item.poster,
                                description: item.description
                            });
                        });

                        cardsHTML += $card.prop('outerHTML');
                    });

                    listContainer.html('<div class="items">' + cardsHTML + '</div>');
                }, function (err) {
                    console.error('V10 v3 ошибка загрузки:', err);
                    listContainer.html(
                        '<div class="empty" style="text-align:center;padding:3em;color:#f33">' +
                        'Ошибка загрузки списка.<br>Проверьте настройку прокси в коде плагина.' +
                        '</div>'
                    );
                }, false, 'get');
            },

            onDestroy: function () {
                // очистка
            }
        };

        // Регистрируем компонент
        Lampa.Component.add('v10_v3', V10Component);

        console.log('%cКнопка V10 v3 добавлена в левое меню. TorrServer готов к воспроизведению.', 'color:#00ff00');
    }

    // Запуск плагина (один раз)
    if (!window.v10_v3_loaded) {
        window.v10_v3_loaded = true;
        startPlugin();
    }
})();
