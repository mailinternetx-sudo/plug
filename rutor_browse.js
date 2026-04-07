/**
 * Rutor Plugin for Lampa (TV)
 * Версия 2.1 – исправлена кнопка меню, удалены нестандартные селекторы
 */

(function() {
    // === КОНФИГУРАЦИЯ ===
    const BASE_URL = 'https://rutor.info';
    const CATEGORIES = [
        { id: 'top', title: '🔥 Топ торренты за 24 часа', url: '/top' },
        { id: 'foreign_films', title: '🎬 Зарубежные фильмы', url: '/films/foreign/' },
        { id: 'russian_films', title: '🇷🇺 Наши фильмы', url: '/films/russian/' },
        { id: 'foreign_series', title: '📺 Зарубежные сериалы', url: '/series/foreign/' },
        { id: 'russian_series', title: '🇷🇺 Наши сериалы', url: '/series/russian/' },
        { id: 'tv', title: '📡 Телевизор', url: '/tv/' }
    ];

    let TS_URL = null;
    function getTsUrl() {
        if (TS_URL) return TS_URL;
        if (typeof TorrServer !== 'undefined' && TorrServer.url) TS_URL = TorrServer.url;
        else if (typeof tsUrl !== 'undefined') TS_URL = window.tsUrl;
        else if (typeof Lampa !== 'undefined' && Lampa.TorrServer && Lampa.TorrServer.url) TS_URL = Lampa.TorrServer.url;
        if (!TS_URL) TS_URL = 'http://localhost:8090';
        return TS_URL;
    }

    // Запрос через прокси TorrServer (если доступен)
    function fetchViaProxy(url) {
        const ts = getTsUrl();
        if (ts) {
            // Прокси – если ваш TorrServer поддерживает /proxy/
            // return fetch(ts + '/proxy/' + encodeURIComponent(url));
            // Если не работает, используйте прямой fetch (может быть CORS)
            return fetch(url).catch(() => fetch(url));
        }
        return fetch(url);
    }

    // Парсинг HTML (безопасный)
    function parseTorrentPage(html) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const items = [];
        const table = doc.querySelector('#index');
        if (!table) return items;

        const rows = table.querySelectorAll('tr.tr1, tr.tr2');
        for (const row of rows) {
            const titleCell = row.querySelector('td.td-t');
            if (!titleCell) continue;
            const titleLink = titleCell.querySelector('a');
            if (!titleLink) continue;
            let title = titleLink.textContent.trim().replace(/\s+/g, ' ');

            let magnet = null;
            const magnetIcon = row.querySelector('a.downgif[href^="magnet:"]');
            if (magnetIcon) magnet = magnetIcon.getAttribute('href');
            if (!magnet) {
                const altMagnet = row.querySelector('a[href^="magnet:"]');
                if (altMagnet) magnet = altMagnet.getAttribute('href');
            }
            if (!magnet) continue;

            const sizeElem = row.querySelector('td.td-size');
            let size = sizeElem ? sizeElem.textContent.trim() : '';
            const seedersElem = row.querySelector('td.td-s');
            let seeders = seedersElem ? seedersElem.textContent.trim() : '0';
            const leechersElem = row.querySelector('td.td-l');
            let leechers = leechersElem ? leechersElem.textContent.trim() : '0';

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

    // Загрузка страницы категории (без проверки на "Дальше", просто возвращаем массив)
    function loadCategoryPage(category, page = 1) {
        let url = BASE_URL + category.url;
        if (page > 1) {
            // Для rutor пагинация через параметр page (для некоторых разделов)
            if (category.url.includes('?')) url += '&page=' + page;
            else url += '?page=' + page;
        }
        return fetchViaProxy(url)
            .then(res => {
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                return res.text();
            })
            .then(html => parseTorrentPage(html))
            .catch(error => {
                console.error('Ошибка загрузки категории:', error);
                Lampa.Notification.show('Не удалось загрузить список: ' + error.message);
                return [];
            });
    }

    // Отображение каталога (с поддержкой пагинации)
    function showCatalog(categoryTitle, items, loadMoreFunc) {
        if (!items.length) {
            Lampa.Notification.show('В категории «' + categoryTitle + '» ничего не найдено');
            return;
        }

        const catalogData = {
            title: categoryTitle,
            component: 'catalog',
            type: 'movie',
            items: items.map(item => ({
                title: item.title,
                description: item.description,
                poster: item.poster,
                rating: item.seeders,
                torrent: item.magnet,
                action: () => playTorrent(item.magnet, item.title)
            })),
            more: loadMoreFunc ? {
                title: 'Загрузить ещё',
                action: () => loadMoreFunc()
            } : null
        };

        const activity = new Lampa.Activity({
            title: categoryTitle,
            component: 'catalog',
            data: catalogData
        });
        activity.open();
    }

    // Обход категории с бесконечной пагинацией
    function browseCategory(category) {
        let currentPage = 1;
        let allItems = [];

        function loadNextPage() {
            Lampa.Notification.progress('Загрузка страницы ' + currentPage + '...');
            loadCategoryPage(category, currentPage).then(items => {
                Lampa.Notification.close();
                if (items.length === 0) {
                    Lampa.Notification.show('Больше нет торрентов');
                    return;
                }
                allItems = allItems.concat(items);
                // Показываем каталог (при первом вызове) или обновляем?
                // В Lampa проще закрыть старый и открыть новый
                showCatalog(category.title, allItems, () => {
                    currentPage++;
                    loadNextPage();
                });
                currentPage++;
            });
        }

        loadNextPage(); // первая страница
    }

    // Воспроизведение через TorrServer
    function playTorrent(magnet, title) {
        if (!magnet) {
            Lampa.Notification.show('Нет magnet-ссылки');
            return;
        }
        const ts = getTsUrl();
        if (ts) {
            const addUrl = ts + '/torrent/add?magnet=' + encodeURIComponent(magnet);
            fetch(addUrl, { method: 'POST' })
                .then(() => {
                    const streamUrl = ts + '/stream?magnet=' + encodeURIComponent(magnet);
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
            Lampa.Notification.show('TorrServer не найден');
        }
    }

    // Диалог выбора категории
    function showCategorySelector() {
        const categoriesList = CATEGORIES.map(cat => ({
            title: cat.title,
            description: 'Нажмите для просмотра',
            action: () => browseCategory(cat)
        }));

        const activity = new Lampa.Activity({
            title: 'Rutor.info — Категории',
            component: 'list',
            data: categoriesList
        });
        activity.open();
    }

    // === ДОБАВЛЕНИЕ КНОПКИ В ЛЕВОЕ МЕНЮ ===
    function addRutorButton() {
        if (typeof Lampa === 'undefined' || !Lampa.Menu) {
            console.warn('Lampa.Menu не доступен');
            return false;
        }
        // Проверяем, не добавлена ли уже
        if (Lampa.Menu.get && Lampa.Menu.get('rutor')) return true;
        
        try {
            Lampa.Menu.add({
                id: 'rutor',               // уникальный идентификатор
                title: 'Rutor',
                icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white" width="24px" height="24px"><path d="M0 0h24v24H0z" fill="none"/><path d="M20 6h-4V4c0-1.1-.9-2-2-2h-4c-1.1 0-2 .9-2 2v2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zM10 4h4v2h-4V4z"/></svg>',
                action: () => showCategorySelector()
            });
            // В некоторых сборках требуется принудительно обновить меню
            if (Lampa.Menu.update) Lampa.Menu.update();
            console.log('[Rutor] Кнопка добавлена');
            return true;
        } catch(e) {
            console.error('[Rutor] Ошибка добавления кнопки:', e);
            return false;
        }
    }

    // Инициализация – ждём готовности Lampa
    function init() {
        if (typeof Lampa !== 'undefined' && Lampa.Listener) {
            // Подписываемся на событие готовности
            Lampa.Listener.follow('ready', function() {
                addRutorButton();
            });
            // Если Lampa уже готова (событие уже прошло), добавляем сразу
            if (Lampa.Component && Lampa.Component.isReady) {
                addRutorButton();
            }
        } else {
            // Fallback: добавляем кнопку после загрузки DOM
            document.addEventListener('lampa:ready', addRutorButton);
            // Также пробуем добавить через таймаут на случай, если событие не сработает
            setTimeout(addRutorButton, 2000);
        }
    }

    init();
})();
