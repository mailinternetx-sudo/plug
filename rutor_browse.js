/**
 * Rutor Plugin for Lampa TV
 * Версия 3.0 – 100% появление кнопки в левом меню
 */

(function() {
    // Конфиг
    const BASE_URL = 'https://rutor.info';
    const CATEGORIES = [
        { title: '🔥 Топ за 24 часа', url: '/top' },
        { title: '🎬 Зарубежные фильмы', url: '/films/foreign/' },
        { title: '🇷🇺 Наши фильмы', url: '/films/russian/' },
        { title: '📺 Зарубежные сериалы', url: '/series/foreign/' },
        { title: '🇷🇺 Наши сериалы', url: '/series/russian/' },
        { title: '📡 Телевизор', url: '/tv/' }
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

    function fetchViaProxy(url) {
        const ts = getTsUrl();
        if (ts) {
            // Прокси через TorrServer – раскомментировать, если поддерживается
            // return fetch(ts + '/proxy/' + encodeURIComponent(url));
        }
        return fetch(url).catch(() => fetch(url));
    }

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
                description: `Размер: ${size} | 👤 Сидеров: ${seeders} | Личеров: ${leechers}`,
                poster: poster
            });
        }
        return items;
    }

    function loadCategoryPage(category, page = 1) {
        let url = BASE_URL + category.url;
        if (page > 1) {
            url += (url.includes('?') ? '&' : '?') + 'page=' + page;
        }
        return fetchViaProxy(url)
            .then(res => {
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                return res.text();
            })
            .then(html => parseTorrentPage(html))
            .catch(error => {
                console.error('Ошибка загрузки:', error);
                Lampa.Notification.show('Ошибка загрузки: ' + error.message);
                return [];
            });
    }

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
                    console.error('TorrServer error', err);
                    Lampa.Notification.show('Ошибка добавления в TorrServer');
                });
        } else {
            Lampa.Notification.show('TorrServer не найден');
        }
    }

    function showCatalog(categoryTitle, items, loadMoreFunc) {
        if (!items.length) {
            Lampa.Notification.show('В категории «' + categoryTitle + '» нет торрентов');
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
            more: loadMoreFunc ? { title: 'Загрузить ещё', action: loadMoreFunc } : null
        };
        const activity = new Lampa.Activity({
            title: categoryTitle,
            component: 'catalog',
            data: catalogData
        });
        activity.open();
    }

    function browseCategory(category) {
        let currentPage = 1;
        let allItems = [];
        function loadNextPage() {
            Lampa.Notification.progress('Загрузка страницы ' + currentPage + '...');
            loadCategoryPage(category, currentPage).then(items => {
                Lampa.Notification.close();
                if (items.length === 0) {
                    Lampa.Notification.show('Торрентов больше нет');
                    return;
                }
                allItems = allItems.concat(items);
                showCatalog(category.title, allItems, () => {
                    currentPage++;
                    loadNextPage();
                });
                currentPage++;
            });
        }
        loadNextPage();
    }

    function showCategorySelector() {
        const cats = CATEGORIES.map(cat => ({
            title: cat.title,
            description: 'Нажмите для просмотра',
            action: () => browseCategory(cat)
        }));
        const activity = new Lampa.Activity({
            title: 'Rutor.info — Категории',
            component: 'list',
            data: cats
        });
        activity.open();
    }

    // ========== ГЛАВНАЯ ФУНКЦИЯ ДОБАВЛЕНИЯ КНОПКИ ==========
    function addButtonToMenu() {
        // Способ 1: через официальное API Lampa.Menu.add
        if (typeof Lampa !== 'undefined' && Lampa.Menu && Lampa.Menu.add) {
            try {
                Lampa.Menu.add({
                    id: 'rutor_plugin',
                    title: 'Rutor',
                    icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white" width="24px" height="24px"><path d="M0 0h24v24H0z" fill="none"/><path d="M20 6h-4V4c0-1.1-.9-2-2-2h-4c-1.1 0-2 .9-2 2v2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zM10 4h4v2h-4V4z"/></svg>',
                    action: showCategorySelector
                });
                if (Lampa.Menu.update) Lampa.Menu.update();
                console.log('[Rutor] Кнопка добавлена через Lampa.Menu');
                return true;
            } catch(e) {
                console.warn('[Rutor] Lampa.Menu.add не сработал', e);
            }
        }

        // Способ 2: прямая манипуляция DOM (костыль для старых сборок)
        function injectDomButton() {
            const menuContainer = document.querySelector('.menu__list, .left-menu__list, [class*="menu-list"]');
            if (!menuContainer) {
                setTimeout(injectDomButton, 500);
                return;
            }
            // Проверяем, нет ли уже кнопки
            if (document.querySelector('.rutor-custom-btn')) return;
            const btn = document.createElement('div');
            btn.className = 'menu__item rutor-custom-btn';
            btn.innerHTML = `
                <div class="menu__item-icon">
                    <svg viewBox="0 0 24 24" width="24" height="24">
                        <path fill="white" d="M20 6h-4V4c0-1.1-.9-2-2-2h-4c-1.1 0-2 .9-2 2v2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zM10 4h4v2h-4V4z"/>
                    </svg>
                </div>
                <div class="menu__item-title">Rutor</div>
            `;
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                showCategorySelector();
            });
            menuContainer.appendChild(btn);
            console.log('[Rutor] Кнопка добавлена через DOM');
        }
        injectDomButton();
        return true;
    }

    // Инициализация: ждём готовность Lampa и добавляем кнопку
    function init() {
        if (typeof Lampa !== 'undefined' && Lampa.Listener) {
            Lampa.Listener.follow('ready', addButtonToMenu);
            if (Lampa.Component && Lampa.Component.isReady) addButtonToMenu();
        } else {
            document.addEventListener('lampa:ready', addButtonToMenu);
            // fallback
            setTimeout(addButtonToMenu, 3000);
        }
    }

    init();
})();
