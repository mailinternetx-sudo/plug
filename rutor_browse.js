/**
 * Rutor Plugin для Lampa (TV-версия) с поддержкой постеров и пагинации
 * Использует TorrServer как прокси для обхода CORS и блокировок
 * @version 2.0
 */

(function() {
    // === КОНФИГУРАЦИЯ ===
    const BASE_URL = 'https://rutor.info';
    // Если rutor заблокирован, можно использовать зеркало:
    // const BASE_URL = 'https://rutor2.torrent';

    // Категории (id, отображаемое название, путь, параметр пагинации)
    const CATEGORIES = [
        { id: 'top', title: '🔥 Топ торренты за 24 часа', url: '/top', pageParam: '' },
        { id: 'foreign_films', title: '🎬 Зарубежные фильмы', url: '/films/foreign/', pageParam: 'page' },
        { id: 'russian_films', title: '🇷🇺 Наши фильмы', url: '/films/russian/', pageParam: 'page' },
        { id: 'foreign_series', title: '📺 Зарубежные сериалы', url: '/series/foreign/', pageParam: 'page' },
        { id: 'russian_series', title: '🇷🇺 Наши сериалы', url: '/series/russian/', pageParam: 'page' },
        { id: 'tv', title: '📡 Телевизор (передачи)', url: '/tv/', pageParam: 'page' }
    ];

    // Определяем URL TorrServer (обычно доступен глобально)
    let TS_URL = null;
    function detectTorrServer() {
        if (TS_URL) return TS_URL;
        // Пытаемся получить из разных источников
        if (typeof TorrServer !== 'undefined' && TorrServer.url) TS_URL = TorrServer.url;
        else if (typeof tsUrl !== 'undefined') TS_URL = window.tsUrl;
        else if (typeof Lampa !== 'undefined' && Lampa.TorrServer && Lampa.TorrServer.url) TS_URL = Lampa.TorrServer.url;
        // Если не найден, можно попробовать стандартный порт
        if (!TS_URL) TS_URL = 'http://localhost:8090';
        return TS_URL;
    }

    // === ФУНКЦИЯ ЗАПРОСА ЧЕРЕЗ ПРОКСИ TORRSERVER ===
    function fetchViaProxy(url) {
        const ts = detectTorrServer();
        // Если TorrServer доступен, используем его прокси (решает CORS и блокировки)
        if (ts) {
            // Раскомментируйте следующую строку, если ваш TorrServer поддерживает /proxy/
            // return fetch(ts + '/proxy/' + encodeURIComponent(url));
            // Если /proxy/ не работает, используем прямой запрос (может быть CORS)
            // Но попробуем сначала через /proxy/ - многие сборки Lampa его поддерживают
            return fetch(ts + '/proxy/' + encodeURIComponent(url)).catch(() => fetch(url));
        }
        return fetch(url);
    }

    // === ПАРСИНГ HTML ===
    function parseTorrentPage(html) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const items = [];

        // Таблица с торрентами имеет id="index"
        const table = doc.querySelector('#index');
        if (!table) return items;

        const rows = table.querySelectorAll('tr.tr1, tr.tr2');
        for (const row of rows) {
            // Ячейка с названием и ссылкой
            const titleCell = row.querySelector('td.td-t');
            if (!titleCell) continue;
            const titleLink = titleCell.querySelector('a');
            if (!titleLink) continue;
            let title = titleLink.textContent.trim().replace(/\s+/g, ' ');

            // Magnet-ссылка (иконка downgif)
            let magnet = null;
            const magnetIcon = row.querySelector('a.downgif[href^="magnet:"]');
            if (magnetIcon) magnet = magnetIcon.getAttribute('href');
            if (!magnet) {
                const altMagnet = row.querySelector('a[href^="magnet:"]');
                if (altMagnet) magnet = altMagnet.getAttribute('href');
            }
            if (!magnet) continue;

            // Размер
            const sizeElem = row.querySelector('td.td-size');
            let size = sizeElem ? sizeElem.textContent.trim() : '';

            // Сидеры / личеры (опционально)
            const seedersElem = row.querySelector('td.td-s');
            let seeders = seedersElem ? seedersElem.textContent.trim() : '0';
            const leechersElem = row.querySelector('td.td-l');
            let leechers = leechersElem ? leechersElem.textContent.trim() : '0';

            // Постер – пытаемся найти в соседней ячейке (td.td-t может содержать картинку превью)
            let poster = null;
            const previewImg = titleCell.querySelector('img');
            if (previewImg && previewImg.src) {
                let posterUrl = previewImg.src;
                if (!posterUrl.startsWith('http')) posterUrl = BASE_URL + posterUrl;
                poster = posterUrl;
            }

            items.push({
                title: title,
                magnet: magnet,
                size: size,
                seeders: seeders,
                leechers: leechers,
                description: `Размер: ${size} | 👤 ${seeders} / ${leechers}`,
                poster: poster
            });
        }
        return items;
    }

    // === ЗАГРУЗКА КАТЕГОРИИ С ПАГИНАЦИЕЙ ===
    // Возвращает Promise<{ items, nextPageExists }>
    function loadCategoryPage(category, page = 1) {
        let url = BASE_URL + category.url;
        if (category.pageParam && page > 1) {
            url += (url.includes('?') ? '&' : '?') + category.pageParam + '=' + page;
        }
        return fetchViaProxy(url)
            .then(res => {
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                return res.text();
            })
            .then(html => {
                const items = parseTorrentPage(html);
                // Определяем, есть ли следующая страница (наличие ссылки "Дальше")
                const parser = new DOMParser();
                const doc = parser.parseFromString(html, 'text/html');
                const nextLink = doc.querySelector('a:contains("Дальше")');
                const nextPageExists = !!nextLink;
                return { items, nextPageExists };
            })
            .catch(error => {
                console.error('Ошибка загрузки категории:', error);
                Lampa.Notification.show('Не удалось загрузить список: ' + error.message);
                return { items: [], nextPageExists: false };
            });
    }

    // === ОТОБРАЖЕНИЕ КАТАЛОГА С ПОСТЕРАМИ (СТАНДАРТНЫЙ COMPONENT 'catalog') ===
    function showCatalog(categoryTitle, items, loadMoreCallback) {
        if (!items.length) {
            Lampa.Notification.show('В категории «' + categoryTitle + '» ничего не найдено');
            return;
        }

        // Формируем объект для Lampa.Catalog
        const catalogData = {
            title: categoryTitle,
            component: 'catalog',
            type: 'movie',  // или 'serial', но для торрентов подходит movie
            items: items.map(item => ({
                title: item.title,
                description: item.description,
                poster: item.poster,
                rating: item.seeders, // можно использовать сидеры как рейтинг
                year: null,
                // Дополнительные поля для плеера
                torrent: item.magnet,
                // При клике запускаем воспроизведение
                action: () => playTorrent(item.magnet, item.title)
            })),
            // Если есть функция подгрузки ещё, добавляем кнопку "Загрузить ещё"
            more: loadMoreCallback ? {
                title: 'Загрузить ещё',
                action: (page) => {
                    loadMoreCallback(page);
                }
            } : null
        };

        const activity = new Lampa.Activity({
            title: categoryTitle,
            component: 'catalog',
            data: catalogData
        });
        activity.open();
    }

    // === УПРАВЛЕНИЕ КАТЕГОРИЕЙ С ПАГИНАЦИЕЙ ===
    function browseCategory(category) {
        let currentPage = 1;
        let allItems = [];
        let hasMore = true;
        let activity = null;

        function loadPage(page) {
            Lampa.Notification.progress('Загрузка страницы ' + page + '...');
            loadCategoryPage(category, page).then(({ items, nextPageExists }) => {
                Lampa.Notification.close();
                if (page === 1) {
                    allItems = items;
                } else {
                    allItems = allItems.concat(items);
                }
                hasMore = nextPageExists;

                // Функция для подгрузки следующей страницы
                const loadMore = (callbackPage) => {
                    if (!hasMore) {
                        Lampa.Notification.show('Больше нет страниц');
                        return;
                    }
                    currentPage++;
                    loadPage(currentPage);
                };

                if (activity) {
                    // Обновляем существующую активность (не просто, проще закрыть и открыть заново)
                    activity.close();
                }
                showCatalog(category.title, allItems, hasMore ? loadMore : null);
                // Для обновления активности нужно пересоздавать, но Lampa не имеет прямого update
                // Поэтому мы просто создаём новую активность, старая закроется
            });
        }

        loadPage(1);
    }

    // === ВОСПРОИЗВЕДЕНИЕ ЧЕРЕЗ TORRSERVER ===
    function playTorrent(magnet, title) {
        if (!magnet) {
            Lampa.Notification.show('Нет magnet-ссылки');
            return;
        }

        // Способ 1: используем встроенный плеер Lampa (если он умеет работать с магнет-ссылками через TorrServer)
        if (typeof Lampa !== 'undefined' && Lampa.Player) {
            // Lampa.Player может принять объект с magnet полем
            try {
                Lampa.Player.play({ torrent: magnet, title: title });
                return;
            } catch(e) {
                console.warn('Lampa.Player.play не сработал', e);
            }
        }

        // Способ 2: прямой вызов API TorrServer
        const ts = detectTorrServer();
        if (ts) {
            const addUrl = ts + '/torrent/add?magnet=' + encodeURIComponent(magnet);
            fetch(addUrl, { method: 'POST' })
                .then(() => {
                    // После добавления запускаем поток через /stream
                    const streamUrl = ts + '/stream?magnet=' + encodeURIComponent(magnet);
                    // Если в Lampa есть внешний плеер, открываем
                    if (typeof Lampa !== 'undefined' && Lampa.Player) {
                        Lampa.Player.play({ file: streamUrl, title: title });
                    } else {
                        window.location.href = streamUrl;
                    }
                })
                .catch(err => {
                    console.error('Ошибка добавления торрента', err);
                    Lampa.Notification.show('Ошибка добавления торрента в TorrServer');
                });
        } else {
            Lampa.Notification.show('TorrServer не найден. Проверьте настройки.');
        }
    }

    // === ДИАЛОГ ВЫБОРА КАТЕГОРИИ ===
    function showCategorySelector() {
        // Используем стандартный компонент 'list' для выбора категории
        const categoriesList = CATEGORIES.map(cat => ({
            title: cat.title,
            description: 'Нажмите для просмотра',
            poster: null,
            action: () => {
                browseCategory(cat);
            }
        }));

        const activity = new Lampa.Activity({
            title: 'Rutor.info — Выбор категории',
            component: 'list',
            data: categoriesList
        });
        activity.open();
    }

    // === РЕГИСТРАЦИЯ ПУНКТА В ЛЕВОМ МЕНЮ ===
    function addMenuButton() {
        if (typeof Lampa === 'undefined') return false;

        // Проверяем, не добавлена ли уже кнопка
        if (Lampa.Menu.exists && Lampa.Menu.exists('rutor')) return;

        Lampa.Menu.add({
            title: 'Rutor',
            icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white" width="24px" height="24px"><path d="M0 0h24v24H0z" fill="none"/><path d="M20 6h-4V4c0-1.1-.9-2-2-2h-4c-1.1 0-2 .9-2 2v2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zM10 4h4v2h-4V4z"/></svg>',
            action: () => showCategorySelector(),
            // Приоритет, чтобы кнопка была выше или ниже
            sort: 100
        });
        console.log('[Rutor Plugin] Кнопка добавлена в меню');
        return true;
    }

    // === ИНИЦИАЛИЗАЦИЯ ПЛАГИНА ===
    function init() {
        if (typeof Lampa === 'undefined') {
            console.warn('[Rutor Plugin] Lampa не найдена, ожидание события');
            document.addEventListener('lampa:ready', () => {
                addMenuButton();
                // Дополнительно можно подписаться на обновление меню
                if (Lampa.Menu && Lampa.Menu.on) {
                    Lampa.Menu.on('update', addMenuButton);
                }
            });
        } else {
            addMenuButton();
        }
    }

    // Запуск
    init();
})();
