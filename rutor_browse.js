/**
 * Rutor Plugin для Lampa (TV-версия)
 * Добавляет пункт меню с категориями из rutor.info
 * Использует TorrServer как прокси для обхода CORS и блокировок
 * @version 1.0
 */

(function() {
    // Конфигурация
    const BASE_URL = 'http://rutor.info';
    const CATEGORIES = [
        { id: 'top', title: 'Топ торренты за последние 24 часа', url: '/top', pageParam: '' },
        { id: 'foreign_films', title: 'Зарубежные фильмы', url: '/films/foreign/', pageParam: 'page' },
        { id: 'russian_films', title: 'Наши фильмы', url: '/films/russian/', pageParam: 'page' },
        { id: 'foreign_series', title: 'Зарубежные сериалы', url: '/series/foreign/', pageParam: 'page' },
        { id: 'russian_series', title: 'Наши сериалы', url: '/series/russian/', pageParam: 'page' },
        { id: 'tv', title: 'Телевизор', url: '/tv/', pageParam: 'page' }
    ];

    // Получение URL TorrServer (обычно доступен глобально)
    let tsUrl = null;
    try {
        if (typeof TorrServer !== 'undefined' && TorrServer.url) tsUrl = TorrServer.url;
        else if (typeof tsUrl !== 'undefined') tsUrl = window.tsUrl;
        else if (typeof Lampa !== 'undefined' && Lampa.TorrServer && Lampa.TorrServer.url) tsUrl = Lampa.TorrServer.url;
    } catch(e) { console.warn('TorrServer не обнаружен', e); }

    // Функция получения контента через прокси TorrServer
    function fetchViaProxy(url) {
        // Если доступен TorrServer и он поддерживает проксирование
        if (tsUrl) {
            // Раскомментировать строку ниже, если ваша сборка Lampa/TorrServer поддерживает прокси
            // return fetch(tsUrl + '/proxy/' + encodeURIComponent(url));
            // Временный fallback: прямой запрос (может не работать из-за CORS)
            return fetch(url);
        }
        // Прямой запрос (риск CORS)
        return fetch(url);
    }

    // Парсинг HTML страницы rutor
    function parseTorrents(html) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const items = [];

        // Поиск таблицы с торрентами (#index)
        const table = doc.querySelector('#index');
        if (!table) return items;

        // Строки торрентов имеют класс tr1 или tr2
        const rows = table.querySelectorAll('tr.tr1, tr.tr2');
        for (const row of rows) {
            // Название фильма/сериала
            const titleElem = row.querySelector('td.td-t a');
            if (!titleElem) continue;
            let title = titleElem.textContent.trim();
            // Очистка от лишних пробелов и переносов
            title = title.replace(/\s+/g, ' ');

            // Magnet-ссылка (иконка downgif)
            let magnet = null;
            const magnetElem = row.querySelector('a.downgif[href^="magnet:"]');
            if (magnetElem) {
                magnet = magnetElem.getAttribute('href');
            } else {
                // Альтернативный поиск
                const altMagnet = row.querySelector('a[href^="magnet:"]');
                if (altMagnet) magnet = altMagnet.getAttribute('href');
            }
            if (!magnet) continue;

            // Дополнительная информация (размер, сидеры, личеры) – опционально
            const sizeElem = row.querySelector('td.td-size');
            const size = sizeElem ? sizeElem.textContent.trim() : '';

            items.push({
                title: title,
                magnet: magnet,
                size: size,
                description: `Размер: ${size}`
            });
        }
        return items;
    }

    // Загрузка категории с пагинацией (подгружается первая страница)
    function loadCategory(category, page = 1) {
        let url = BASE_URL + category.url;
        if (category.pageParam && page > 1) {
            url += (url.includes('?') ? '&' : '?') + category.pageParam + '=' + page;
        }

        return fetchViaProxy(url)
            .then(response => {
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                return response.text();
            })
            .then(html => parseTorrents(html))
            .catch(error => {
                console.error('Ошибка загрузки категории:', error);
                Lampa.Notification.show('Не удалось загрузить список: ' + error.message);
                return [];
            });
    }

    // Отображение списка фильмов через стандартный компонент Lampa
    function showMovieList(items, categoryTitle) {
        if (!items.length) {
            Lampa.Notification.show('В категории «' + categoryTitle + '» ничего не найдено');
            return;
        }

        // Преобразуем в формат Lampa.Catalog
        const catalogData = {
            title: categoryTitle,
            component: 'catalog',
            items: items.map(item => ({
                title: item.title,
                description: item.description || 'Торрент',
                poster: null, // можно добавить постер, если парсить отдельно
                action: () => playTorrent(item.magnet, item.title)
            }))
        };

        // Открываем активность с каталогом
        const activity = new Lampa.Activity({
            title: categoryTitle,
            component: 'catalog',
            data: catalogData
        });
        activity.open();
    }

    // Воспроизведение через TorrServer
    function playTorrent(magnet, title) {
        if (!magnet) {
            Lampa.Notification.show('Нет magnet-ссылки для воспроизведения');
            return;
        }

        // Способ 1: используем встроенный TorrServer Lampa
        if (typeof Lampa !== 'undefined' && Lampa.TorrServer && typeof Lampa.TorrServer.play === 'function') {
            Lampa.TorrServer.play(magnet);
            return;
        }

        // Способ 2: прямой вызов через TorrServer API + плеер Lampa
        if (tsUrl) {
            const addUrl = tsUrl + '/torrent/add?magnet=' + encodeURIComponent(magnet);
            fetch(addUrl, { method: 'POST' })
                .then(() => {
                    // Ожидаем, что торрент добавился, затем запускаем плеер
                    // Lampa.Player часто сам подхватывает последний добавленный торрент
                    if (typeof Lampa !== 'undefined' && Lampa.Player) {
                        Lampa.Player.play({ torrent: magnet, title: title });
                    } else {
                        // Альтернатива: открыть поток через TorrServer
                        const streamUrl = tsUrl + '/stream?magnet=' + encodeURIComponent(magnet);
                        window.location.href = streamUrl;
                    }
                })
                .catch(err => {
                    console.error('Ошибка добавления торрента', err);
                    Lampa.Notification.show('Ошибка добавления торрента в TorrServer');
                });
        } else {
            Lampa.Notification.show('TorrServer не настроен. Воспроизведение невозможно.');
        }
    }

    // Диалог выбора категории (левое меню → список категорий)
    function showCategorySelector() {
        const categoriesList = CATEGORIES.map(cat => ({
            title: cat.title,
            description: 'Нажмите для просмотра',
            action: () => {
                // Показываем индикатор загрузки
                Lampa.Notification.progress('Загрузка...');
                loadCategory(cat).then(items => {
                    Lampa.Notification.close();
                    if (items.length) {
                        showMovieList(items, cat.title);
                    } else {
                        Lampa.Notification.show('В категории нет торрентов', 3000);
                    }
                });
            }
        }));

        const activity = new Lampa.Activity({
            title: 'Rutor.info',
            component: 'list',
            data: categoriesList
        });
        activity.open();
    }

    // Регистрация плагина в Lampa
    function initPlugin() {
        if (typeof Lampa === 'undefined') {
            console.error('Lampa не загружена');
            return;
        }

        // Добавляем пункт в левое меню
        Lampa.Menu.add({
            title: 'Rutor',
            icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white" width="24px" height="24px"><path d="M0 0h24v24H0z" fill="none"/><path d="M20 6h-4V4c0-1.1-.9-2-2-2h-4c-1.1 0-2 .9-2 2v2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zM10 4h4v2h-4V4z"/></svg>',
            action: () => showCategorySelector()
        });
    }

    // Ожидаем готовность Lampa
    if (typeof Lampa !== 'undefined' && Lampa.Listener) {
        Lampa.Listener.follow('ready', initPlugin);
    } else {
        document.addEventListener('lampa:ready', initPlugin);
    }
})();
