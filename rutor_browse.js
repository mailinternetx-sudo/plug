(function () {
    'use strict';

    // ================================================
    // Плагин V10 v3 (улучшенная версия)
    // - Кнопка в левом меню между «Главная» и «Лента»
    // - Надёжный парсинг rutor.info
    // - Кэширование страниц
    // - Пагинация и обработка ошибок
    // ================================================

    // ================= НАСТРОЙКИ =================
    var PROXY = 'https://corsproxy.io/?';   // можно заменить или оставить пустым
    var ITEMS_PER_PAGE = 30;                // элементов на странице
    var CACHE_TTL = 10 * 60 * 1000;         // кэш на 10 минут

    // Категории rutor.info
    var CATEGORIES = [
        { name: 'Топ торренты за 24 часа', url: 'https://rutor.info/top' },
        { name: 'Зарубежные фильмы',       url: 'https://rutor.info/browse/155/1/0/0' },
        { name: 'Наши фильмы',             url: 'https://rutor.info/browse/156/1/0/0' },
        { name: 'Зарубежные сериалы',      url: 'https://rutor.info/browse/157/1/0/0' },
        { name: 'Наши сериалы',            url: 'https://rutor.info/browse/158/1/0/0' },
        { name: 'Телевизор',               url: 'https://rutor.info/browse/159/1/0/0' }
    ];

    // Простой кэш в памяти
    var cache = {};

    function getCached(url) {
        var now = Date.now();
        if (cache[url] && (now - cache[url].timestamp < CACHE_TTL)) {
            return cache[url].data;
        }
        return null;
    }

    function setCached(url, data) {
        cache[url] = { data: data, timestamp: Date.now() };
    }

    // =============== УЛУЧШЕННЫЙ ПАРСИНГ ===============
    function parseTorrents(html) {
        var items = [];
        // Ищем строки таблицы: tr с классами tTr, gai, gaia и т.п.
        var rows = html.match(/<tr[^>]*class="(?:tTr|gai?a?)"[^>]*>[\s\S]*?<\/tr>/gi);
        if (!rows) return items;

        for (var i = 0; i < rows.length; i++) {
            var row = rows[i];
            // ID торрента
            var idMatch = row.match(/<a[^>]*href="\/torrent\/(\d+)"[^>]*>/i);
            if (!idMatch) continue;
            var id = idMatch[1];
            var torrentUrl = 'https://rutor.info/download/' + id + '.torrent';

            // Название раздачи
            var titleMatch = row.match(/<a[^>]*href="\/torrent\/\d+"[^>]*>([\s\S]*?)<\/a>/i);
            var title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : 'Без названия';
            title = title.replace(/\s+/g, ' ');

            // Размер и сидеры (для описания)
            var sizeMatch = row.match(/<td[^>]*align="center"[^>]*>([\d.]+ [МГБ]+)/i);
            var size = sizeMatch ? sizeMatch[1] : '';
            var seedMatch = row.match(/<td[^>]*align="center"[^>]*>\s*(\d+)\s*<\/td>/i);
            var seeds = seedMatch ? seedMatch[1] : '0';

            var description = 'Размер: ' + size + ' | Сидеров: ' + seeds;
            var info = 'Rutor.info | ' + (size || 'размер неизвестен');

            items.push({
                title: title,
                poster: '',
                torrent: torrentUrl,
                description: description,
                info: info,
                year: ''
            });
        }
        return items;
    }

    // =============== ЗАГРУЗКА СТРАНИЦЫ (с кэшем) ===============
    function loadPage(url, callback, errorCallback) {
        var cached = getCached(url);
        if (cached) {
            callback(cached);
            return;
        }

        var fullUrl = PROXY ? PROXY + encodeURIComponent(url) : url;
        Lampa.Network.silent(fullUrl, function (html) {
            var items = parseTorrents(html);
            setCached(url, items);
            callback(items);
        }, function (err) {
            console.error('V10 v3 ошибка загрузки:', err);
            if (errorCallback) errorCallback(err);
        }, false, 'get');
    }

    // =============== КОМПОНЕНТ С ПАГИНАЦИЕЙ ===============
    var V10Component = {
        activity: null,
        currentCategoryIndex: 0,
        currentPage: 1,
        allItems: [],
        totalPages: 1,

        onStart: function (data) {
            this.activity = data.activity;
            this.activity.render().html(
                '<div class="activity__body" style="padding:1.2em 0">' +
                    '<div id="v10-tabs" style="margin-bottom:1.5em"></div>' +
                    '<div id="v10-list" class="items-line"></div>' +
                    '<div id="v10-pagination" style="display:flex;justify-content:center;margin-top:1.5em;gap:12px"></div>' +
                '</div>'
            );
            this.buildTabs();
            this.loadCategory(0, 1);
        },

        buildTabs: function () {
            var self = this;
            var tabsHTML = '<div class="tabs__list" style="display:flex;flex-wrap:wrap;gap:8px;padding:0 12px">';
            CATEGORIES.forEach(function (cat, i) {
                tabsHTML += '<div class="tabs__item selector" data-index="' + i + '" ' +
                    'style="padding:8px 16px;border-radius:8px;background:#222;color:#fff;cursor:pointer">' +
                    cat.name + '</div>';
            });
            tabsHTML += '</div>';
            $('#v10-tabs').html(tabsHTML);

            $('#v10-tabs .tabs__item').on('hover:enter', function () {
                var idx = parseInt($(this).attr('data-index'));
                if (self.currentCategoryIndex !== idx) {
                    self.currentCategoryIndex = idx;
                    self.loadCategory(idx, 1);
                }
            });
        },

        loadCategory: function (index, page) {
            var self = this;
            var cat = CATEGORIES[index];
            this.currentPage = page || 1;
            this.activity.loading.show();

            loadPage(cat.url, function (items) {
                self.activity.loading.hide();
                self.allItems = items;
                self.totalPages = Math.ceil(items.length / ITEMS_PER_PAGE) || 1;
                self.renderCurrentPage();
                self.renderPagination();
            }, function (err) {
                self.activity.loading.hide();
                $('#v10-list').html(
                    '<div class="empty" style="text-align:center;padding:3em;color:#f33">' +
                    'Ошибка загрузки.<br>Проверьте прокси или доступность rutor.info' +
                    '</div>'
                );
                $('#v10-pagination').empty();
            });
        },

        renderCurrentPage: function () {
            var start = (this.currentPage - 1) * ITEMS_PER_PAGE;
            var end = start + ITEMS_PER_PAGE;
            var pageItems = this.allItems.slice(start, end);

            if (pageItems.length === 0) {
                $('#v10-list').html('<div class="empty" style="text-align:center;padding:3em;color:#888">Нет раздач</div>');
                return;
            }

            var cardsHTML = '';
            for (var i = 0; i < pageItems.length; i++) {
                var item = pageItems[i];
                var card = Lampa.Template.get('card', {
                    title: item.title,
                    poster: item.poster || '',
                    description: item.description,
                    info: item.info
                });
                var $card = $(card);
                $card.on('hover:enter', (function (torrItem) {
                    return function () {
                        Lampa.Torrent.open({
                            title: torrItem.title,
                            torrent: torrItem.torrent,
                            poster: torrItem.poster,
                            description: torrItem.description
                        });
                    };
                })(item));
                cardsHTML += $card.prop('outerHTML');
            }
            $('#v10-list').html('<div class="items">' + cardsHTML + '</div>');
        },

        renderPagination: function () {
            var self = this;
            var container = $('#v10-pagination');
            if (this.totalPages <= 1) {
                container.empty();
                return;
            }

            var btnsHTML = '';
            if (this.currentPage > 1) {
                btnsHTML += '<div class="selector pagination-prev" style="padding:6px 12px;background:#333;border-radius:6px">◀ Назад</div>';
            }
            btnsHTML += '<span style="padding:6px 12px;background:#111;border-radius:6px">' + this.currentPage + ' / ' + this.totalPages + '</span>';
            if (this.currentPage < this.totalPages) {
                btnsHTML += '<div class="selector pagination-next" style="padding:6px 12px;background:#333;border-radius:6px">Вперед ▶</div>';
            }
            container.html(btnsHTML);

            container.find('.pagination-prev').on('hover:enter', function () {
                if (self.currentPage > 1) {
                    self.currentPage--;
                    self.renderCurrentPage();
                    self.renderPagination();
                }
            });
            container.find('.pagination-next').on('hover:enter', function () {
                if (self.currentPage < self.totalPages) {
                    self.currentPage++;
                    self.renderCurrentPage();
                    self.renderPagination();
                }
            });
        },

        onDestroy: function () {}
    };

    // =============== ВСТАВКА КНОПКИ МЕЖДУ «ГЛАВНАЯ» И «ЛЕНТА» ===============
    function addMenuButton() {
        Lampa.Listener.follow('menu', function (e) {
            if (e.type !== 'complite' && e.type !== 'update') return;

            var menuContainer = e.object.activity.render().find('.menu__list, .left__menu, .sidebar__list, .menu-list');
            if (menuContainer.length === 0) return;
            if (menuContainer.find('.v10-v3-btn').length > 0) return;

            // Находим кнопку «Главная» (обычно первый элемент)
            var mainButton = menuContainer.find('.menu__item').first();
            // Находим кнопку «Лента» (ищем по тексту)
            var feedButton = null;
            menuContainer.find('.menu__item').each(function () {
                if ($(this).find('.menu__text').text().trim() === 'Лента') {
                    feedButton = $(this);
                }
            });

            // Создаём нашу кнопку
            var btnHTML = 
                '<div class="menu__item selector v10-v3-btn">' +
                    '<div class="menu__ico"><span style="font-size:22px;line-height:1">🎬</span></div>' +
                    '<div class="menu__text">V10 v3</div>' +
                '</div>';
            var btn = $(btnHTML);

            btn.on('hover:enter', function () {
                Lampa.Activity.push({
                    component: 'v10_v3',
                    title: 'V10 v3 — Торренты с rutor.info',
                    page: 1
                });
            });

            // Вставляем после «Главная», но перед «Лента»
            if (feedButton && mainButton) {
                // Если есть «Лента», вставляем перед ней
                feedButton.before(btn);
            } else if (mainButton) {
                // Иначе после «Главная»
                mainButton.after(btn);
            } else {
                // На крайний случай — в конец
                menuContainer.append(btn);
            }
        });
    }

    // =============== РЕГИСТРАЦИЯ ПЛАГИНА ===============
    if (!window.v10_v3_loaded) {
        window.v10_v3_loaded = true;
        Lampa.Component.add('v10_v3', V10Component);
        addMenuButton();
        console.log('%c✅ Плагин V10 v3 загружен. Кнопка между «Главная» и «Лента». Кэширование активно.', 'color:#00ff00;font-weight:bold');
    }
})();
