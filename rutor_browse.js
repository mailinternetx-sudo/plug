(function () {
    'use strict';

    // ============================================================
    //  Плагин Rutor для Lampa с поддержкой TorrServer
    //  Версия 1.1.0
    // ============================================================

    const PLUGIN_NAME = 'RutorTorr';
    const PLUGIN_VERSION = '1.1.0';
    const DEBUG = true;

    // ---------- Категории rutor.info (проверенные ID) ----------
    const CATEGORIES = {
        top24: {
            id: 0,
            name: 'Топ торренты за 24 часа',
            url: '/'                 // главная страница показывает топ за 24ч
        },
        foreign_movies: {
            id: 4,
            name: 'Зарубежные фильмы',
            url: '/browse/4'
        },
        our_movies: {
            id: 3,
            name: 'Наши фильмы',
            url: '/browse/3'
        },
        foreign_series: {
            id: 2,
            name: 'Зарубежные сериалы',
            url: '/browse/2'
        },
        our_series: {
            id: 1,
            name: 'Наши сериалы',
            url: '/browse/1'
        },
        tv: {
            id: 5,
            name: 'Телевизор',
            url: '/browse/5'
        }
    };

    // ---------- Настройки ----------
    let settings = {
        enabled: true,
        torrServerUrl: 'http://127.0.0.1:8090',
        useProxy: false
    };
    const STORAGE_KEY = 'rutor_torr_settings';

    function log(...args) {
        if (DEBUG) console.log(`[${PLUGIN_NAME}]`, ...args);
    }
    function errorLog(...args) {
        console.error(`[${PLUGIN_NAME}]`, ...args);
    }

    function loadSettings() {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            try {
                Object.assign(settings, JSON.parse(saved));
                log('Настройки загружены', settings);
            } catch(e) { errorLog(e); }
        }
    }
    function saveSettings() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
        log('Настройки сохранены');
    }

    function getProxiedUrl(url) {
        if (settings.useProxy && settings.torrServerUrl) {
            return `${settings.torrServerUrl}/proxy/?url=${encodeURIComponent(url)}`;
        }
        return url;
    }

    // ---------- Продвинутый парсинг rutor.info ----------
    function parseRutorPage(html, categoryName) {
        const items = [];
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        // Ищем таблицу с раздачами: обычно это <table class="tablesaw" ...> или просто первая таблица
        let table = doc.querySelector('table.tablesaw');
        if (!table) table = doc.querySelector('table');
        if (!table) {
            errorLog('Таблица с торрентами не найдена');
            return items;
        }

        const rows = table.querySelectorAll('tr');
        log(`Найдено строк в таблице: ${rows.length}`);

        for (const row of rows) {
            // Пропускаем заголовки (если есть th)
            if (row.querySelector('th')) continue;

            const titleCell = row.querySelector('td:nth-child(2) a');
            if (!titleCell) continue;

            let title = titleCell.textContent.trim();
            // Убираем лишние пробелы и переводы строк
            title = title.replace(/\s+/g, ' ');

            // magnet-ссылка – обычно в третьей колонке <a href="magnet:...">
            const magnetLink = row.querySelector('td:nth-child(3) a[href^="magnet:"]')?.getAttribute('href');
            if (!magnetLink) continue;

            // Размер (4-я колонка)
            const sizeCell = row.querySelector('td:nth-child(4)');
            const size = sizeCell ? sizeCell.textContent.trim() : 'N/A';

            // Сидеры (5-я колонка)
            const seedsCell = row.querySelector('td:nth-child(5)');
            let seeds = seedsCell ? seedsCell.textContent.trim() : '0';
            seeds = seeds.replace(/[^\d]/g, '') || '0';

            // Личеры (6-я колонка)
            const leechCell = row.querySelector('td:nth-child(6)');
            let leech = leechCell ? leechCell.textContent.trim() : '0';
            leech = leech.replace(/[^\d]/g, '') || '0';

            // Дата (1-я колонка)
            const dateCell = row.querySelector('td:nth-child(1)');
            let date = dateCell ? dateCell.textContent.trim() : '';

            items.push({
                title,
                magnet: magnetLink,
                size,
                seeds,
                leech,
                date,
                category: categoryName
            });
        }

        log(`Категория "${categoryName}": распаршено ${items.length} раздач`);
        if (items.length === 0 && DEBUG) {
            // Выводим небольшой фрагмент HTML для отладки
            const sample = html.substring(0, 500);
            errorLog('HTML не содержит ожидаемых данных. Фрагмент:', sample);
        }
        return items;
    }

    // ---------- Загрузка страницы rutor.info с обработкой CORS ----------
    async function loadRutorPage(categoryKey) {
        const cat = CATEGORIES[categoryKey];
        if (!cat) return [];

        let url = `https://rutor.info${cat.url}`;
        if (categoryKey === 'top24') url = 'https://rutor.info/';

        const proxiedUrl = getProxiedUrl(url);
        log(`Загрузка: ${proxiedUrl}`);

        try {
            const response = await fetch(proxiedUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'ru-RU,ru;q=0.8,en-US;q=0.5,en;q=0.3'
                }
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const html = await response.text();
            if (!html || html.length < 100) throw new Error('Получен пустой HTML');
            return parseRutorPage(html, cat.name);
        } catch (e) {
            errorLog('Ошибка загрузки:', e.message);
            if (!settings.useProxy && (e.message.includes('Failed to fetch') || e.message.includes('CORS'))) {
                Lampa.Notification.show('Ошибка CORS! Включите "Использовать прокси TorrServer" в настройках плагина', 5000);
            } else if (!settings.useProxy) {
                Lampa.Notification.show('Не удалось загрузить данные. Попробуйте включить прокси TorrServer в настройках.', 4000);
            }
            return [];
        }
    }

    // ---------- TorrServer: добавление магнита и получение потока ----------
    async function addMagnetToTorrServer(magnet) {
        const tsUrl = settings.torrServerUrl;
        if (!tsUrl) {
            errorLog('TorrServer не задан');
            return null;
        }
        try {
            // Добавляем торрент (используем POST, так как GET может не работать в новых версиях)
            const addUrl = `${tsUrl}/torrents/add`;
            const formData = new URLSearchParams();
            formData.append('magnet', magnet);
            const addResp = await fetch(addUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: formData.toString()
            });
            if (!addResp.ok) throw new Error(`HTTP ${addResp.status}`);
            const data = await addResp.json();
            const hash = data.hash || data.info_hash;
            if (!hash) throw new Error('Не получен хэш');

            // Получаем список файлов
            const filesResp = await fetch(`${tsUrl}/torrents/${hash}/files`);
            const files = await filesResp.json();
            if (!files.length) throw new Error('Нет файлов');

            // Ищем видеофайл
            let videoIndex = files.findIndex(f => /\.(mkv|mp4|avi|mov|ts|m4v)$/i.test(f.name));
            if (videoIndex === -1) videoIndex = 0;
            const streamUrl = `${tsUrl}/stream/${hash}/${videoIndex}`;
            log('Stream URL:', streamUrl);
            return streamUrl;
        } catch (e) {
            errorLog('TorrServer ошибка:', e);
            return null;
        }
    }

    async function playMovie(item) {
        if (!item.magnet) {
            Lampa.Notification.show('Нет magnet-ссылки', 3000);
            return;
        }
        Lampa.Notification.show('Добавление в TorrServer...', 2000);
        const streamUrl = await addMagnetToTorrServer(item.magnet);
        if (streamUrl) {
            Lampa.Player.play(streamUrl, { title: item.title });
        } else {
            Lampa.Notification.show('Ошибка воспроизведения', 4000);
        }
    }

    // ---------- Отображение каталога в Lampa ----------
    function showCatalog(items, categoryName) {
        if (!items.length) {
            Lampa.Notification.show(`В категории "${categoryName}" ничего не найдено`, 4000);
            return;
        }
        const catalogItems = items.map((item, idx) => {
            let year = '';
            const yearMatch = item.title.match(/\((\d{4})\)/);
            if (yearMatch) year = yearMatch[1];
            const poster = `https://via.placeholder.com/300x450/1a1a2e/ffffff?text=${encodeURIComponent(item.title.substring(0, 20))}`;
            return {
                id: `rutor_${Date.now()}_${idx}`,
                title: item.title,
                year,
                poster,
                description: `📁 ${item.size} | 👤 ${item.seeds} | 🔽 ${item.leech}\n📅 ${item.date}`,
                magnet: item.magnet
            };
        });

        Lampa.Activity.push({
            url: '',
            title: categoryName,
            component: 'catalog',
            catalog: {
                items: catalogItems,
                source: { title: categoryName, poster: 'https://rutor.info/favicon.ico' }
            },
            onSelect: (item) => playMovie(item)
        });
    }

    // ---------- Обработчик выбора категории ----------
    async function onCategorySelect(categoryKey) {
        Lampa.Notification.show('Загрузка списка...', 1500);
        const items = await loadRutorPage(categoryKey);
        if (items.length) {
            showCatalog(items, CATEGORIES[categoryKey].name);
        } else {
            // Дополнительная диагностика
            if (!settings.useProxy) {
                Lampa.Notification.show('Список пуст. Возможно, нужен прокси. Включите в настройках плагина.', 5000);
            } else {
                Lampa.Notification.show('Не удалось загрузить данные. Проверьте адрес TorrServer.', 5000);
            }
        }
    }

    // ---------- Модальное окно выбора категорий ----------
    function showCategoriesModal() {
        const $container = $('<div class="rutor-categories-container" style="display:flex; flex-wrap:wrap; justify-content:center; padding:20px;"></div>');
        for (const [key, cat] of Object.entries(CATEGORIES)) {
            const $btn = $(`
                <div class="rutor-category-btn selector" data-category="${key}" style="
                    background: linear-gradient(135deg, #1e1e2f, #2a2a3a);
                    border-radius: 16px; margin: 12px; padding: 16px 24px;
                    min-width: 180px; text-align: center; cursor: pointer;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                ">
                    <div style="font-size: 1.2em; font-weight: bold; color: #fff;">${cat.name}</div>
                    <div style="font-size: 0.8em; color: #aaa;">ID ${cat.id}</div>
                </div>
            `);
            $btn.on('hover:enter', function() {
                const catKey = $(this).data('category');
                Lampa.Modal.close();
                onCategorySelect(catKey);
            });
            $container.append($btn);
        }
        // Кнопка настроек
        const $settingsBtn = $(`
            <div class="rutor-category-btn selector" style="
                background: linear-gradient(135deg, #3a2a2a, #2a1a1a);
                border-radius: 16px; margin: 12px; padding: 16px 24px;
                min-width: 180px; text-align: center; cursor: pointer;
            ">
                <div style="font-size: 1.2em; font-weight: bold; color: #ffaa00;">⚙️ Настройки</div>
                <div style="font-size: 0.8em; color: #ccc;">TorrServer и прокси</div>
            </div>
        `);
        $settingsBtn.on('hover:enter', () => {
            Lampa.Modal.close();
            Lampa.SettingsApi.open('rutor_torr');
        });
        $container.append($settingsBtn);

        Lampa.Modal.open({
            title: 'Rutor.info торренты',
            html: $container,
            size: 'full',
            onBack: () => { Lampa.Modal.close(); Lampa.Controller.toggle('menu'); }
        });

        // Управление фокусом для пульта
        setTimeout(() => {
            const $btns = $container.find('.selector');
            let idx = 0;
            function updateFocus(i) {
                $btns.removeClass('focus');
                $btns.eq(i).addClass('focus').attr('tabindex', '0').focus();
                idx = i;
            }
            if ($btns.length) updateFocus(0);
            Lampa.Controller.add('rutor_categories', {
                toggle: () => { Lampa.Controller.collectionSet($btns); updateFocus(idx); },
                up: () => { let i = idx - 1; if (i < 0) i = $btns.length - 1; updateFocus(i); },
                down: () => { let i = idx + 1; if (i >= $btns.length) i = 0; updateFocus(i); },
                left: () => {},
                right: () => {},
                back: () => { Lampa.Modal.close(); Lampa.Controller.toggle('menu'); },
                enter: () => $btns.eq(idx).trigger('hover:enter')
            });
            Lampa.Controller.toggle('rutor_categories');
        }, 100);
    }

    // ---------- Добавление кнопки в главное меню Lampa ----------
    function addMenuButton() {
        const $menu = $('.menu .menu__list').first();
        if (!$menu.length) { setTimeout(addMenuButton, 500); return; }
        if ($('.menu__item.rutor-torr-menu-btn').length) return;

        const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1.2em" height="1.2em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v8M8 12h8"/></svg>`;
        const $btn = $(`<li class="menu__item selector rutor-torr-menu-btn"><div class="menu__ico">${iconSvg}</div><div class="menu__text">Rutor торренты</div></li>`);
        $btn.on('hover:enter', showCategoriesModal);
        $menu.append($btn);
        log('Кнопка в меню добавлена');
    }

    // ---------- Компонент настроек в Lampa ----------
    function addSettingsComponent() {
        Lampa.SettingsApi.addComponent({
            component: 'rutor_torr',
            name: 'Rutor + TorrServer',
            icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10"/><path d="M12 8v8M8 12h8"/></svg>'
        });
        Lampa.SettingsApi.addParam({
            component: 'rutor_torr',
            param: { name: 'torrServerUrl', type: 'input', default: settings.torrServerUrl },
            field: { name: 'Адрес TorrServer', description: 'http://IP:8090' },
            onChange: (val) => { settings.torrServerUrl = val; saveSettings(); }
        });
        Lampa.SettingsApi.addParam({
            component: 'rutor_torr',
            param: { name: 'useProxy', type: 'trigger', default: settings.useProxy },
            field: { name: 'Использовать прокси TorrServer', description: 'Обязательно включите, если rutor.info не загружается' },
            onChange: (val) => { settings.useProxy = val; saveSettings(); }
        });
        Lampa.SettingsApi.addParam({
            component: 'rutor_torr',
            param: { type: 'button', component: 'about' },
            field: { name: 'О плагине', description: `Версия ${PLUGIN_VERSION}` },
            onChange: () => {
                Lampa.Modal.open({
                    title: 'О плагине',
                    html: `<div style="padding:20px;text-align:center;"><h3>${PLUGIN_NAME}</h3><p>Версия ${PLUGIN_VERSION}</p><p>Загружает торренты с rutor.info и воспроизводит через TorrServer.</p><p>При проблемах включите прокси TorrServer в настройках.</p></div>`,
                    size: 'small'
                });
            }
        });
    }

    // ---------- Старт ----------
    function init() {
        loadSettings();
        addSettingsComponent();
        if (window.Lampa && window.Lampa.App && window.Lampa.App.ready) addMenuButton();
        else Lampa.Listener.follow('app', (e) => { if (e.type === 'ready') addMenuButton(); });
        log('Инициализация завершена');
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();

    window.RutorTorrPlugin = { name: PLUGIN_NAME, version: PLUGIN_VERSION, settings };
})();
