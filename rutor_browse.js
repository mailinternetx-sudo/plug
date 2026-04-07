(function () {
    'use strict';

    // ============================================================
    //  Плагин Rutor для Lampa с поддержкой TorrServer
    //  Версия 1.2.0 (Исправлено отображение списка)
    // ============================================================

    const PLUGIN_NAME = 'RutorTorr';
    const PLUGIN_VERSION = '1.2.0';
    const DEBUG = true;

    const CATEGORIES = {
        top24: { id: 0, name: 'Топ торренты за 24 часа', url: '/' },
        foreign_movies: { id: 4, name: 'Зарубежные фильмы', url: '/browse/4' },
        our_movies: { id: 3, name: 'Наши фильмы', url: '/browse/3' },
        foreign_series: { id: 2, name: 'Зарубежные сериалы', url: '/browse/2' },
        our_series: { id: 1, name: 'Наши сериалы', url: '/browse/1' },
        tv: { id: 5, name: 'Телевизор', url: '/browse/5' }
    };

    let settings = {
        enabled: true,
        torrServerUrl: 'http://217.25.229.57:8090',
        useProxy: true // По умолчанию ВКЛЮЧЕНО, так как без прокси рутор не отдаст данные
    };
    const STORAGE_KEY = 'rutor_torr_settings';

    function log(...args) { if (DEBUG) console.log(`[${PLUGIN_NAME}]`, ...args); }
    function errorLog(...args) { console.error(`[${PLUGIN_NAME}]`, ...args); }

    function loadSettings() {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) Object.assign(settings, JSON.parse(saved));
        } catch (e) { errorLog(e); }
    }
    function saveSettings() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    }

    function getProxiedUrl(url) {
        // Правильный формат прокси для TorrServer
        if (settings.useProxy && settings.torrServerUrl) {
            return `${settings.torrServerUrl}/proxy?url=${encodeURIComponent(url)}`;
        }
        return url;
    }

    // ---------- Улучшенный парсинг rutor.info ----------
    function parseRutorPage(html, categoryName) {
        const items = [];
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        // Ищем таблицу (на руторе ID таблицы часто меняется, поэтому ищем по тегу и наличию magnet)
        const tables = doc.querySelectorAll('table');
        let targetTable = null;

        for (const table of tables) {
            if (table.innerHTML.includes('magnet:')) {
                targetTable = table;
                break;
            }
        }

        if (!targetTable) {
            errorLog('Таблица с magnet-ссылками не найдена');
            return items;
        }

        const rows = targetTable.querySelectorAll('tr');

        for (const row of rows) {
            if (row.querySelector('th')) continue;

            // Ищем magnet-ссылку. Если её нет — это не торрент.
            const magnetEl = row.querySelector('a[href^="magnet:"]');
            if (!magnetEl) continue;
            const magnet = magnetEl.getAttribute('href');

            // Ищем название. Обычно это первая ссылка во второй колонке, ведущая на /torrent/
            let titleEl = row.querySelector('td:nth-child(2) a[href*="/torrent/"]');
            if (!titleEl) titleEl = row.querySelector('td:nth-child(2) a'); // Fallback
            
            if (!titleEl) continue;
            
            let title = titleEl.textContent.trim().replace(/\s+/g, ' ');

            // Извлекаем данные из остальных ячеек
            const cells = row.querySelectorAll('td');
            let size = 'N/A', seeds = '0', leech = '0', date = '';

            if (cells.length >= 2) date = cells[0].textContent.trim();
            if (cells.length >= 4) size = cells[3].textContent.trim();
            if (cells.length >= 5) seeds = cells[4].textContent.trim().replace(/[^\d]/g, '') || '0';
            if (cells.length >= 6) leech = cells[5].textContent.trim().replace(/[^\d]/g, '') || '0';

            items.push({ title, magnet, size, seeds, leech, date, category: categoryName });
        }

        log(`Категория "${categoryName}": распаршено ${items.length} раздач`);
        return items;
    }

    // ---------- Загрузка страницы ----------
    async function loadRutorPage(categoryKey) {
        const cat = CATEGORIES[categoryKey];
        if (!cat) return [];

        const url = `https://rutor.info${cat.url}`;
        const proxiedUrl = getProxiedUrl(url);
        log(`Загрузка: ${proxiedUrl}`);

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000); // Таймаут 10 сек

            const response = await fetch(proxiedUrl, {
                signal: controller.signal,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                }
            });
            clearTimeout(timeoutId);

            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const html = await response.text();
            if (!html || html.length < 500) throw new Error('Получен пустой или слишком короткий HTML');
            
            return parseRutorPage(html, cat.name);
        } catch (e) {
            errorLog('Ошибка загрузки:', e.message);
            if (!settings.useProxy) {
                Lampa.Notification.show('Ошибка сети! Включите прокси TorrServer в настройках плагина.', 5000);
            } else {
                Lampa.Notification.show('Ошибка загрузки. Проверьте работу TorrServer и его прокси.', 5000);
            }
            return [];
        }
    }

    // ---------- TorrServer: добавление и воспроизведение ----------
    async function addMagnetToTorrServer(magnet) {
        const tsUrl = settings.torrServerUrl.replace(/\/$/, ''); // Убираем слэш на конце
        try {
            // Добавляем торрент
            const addResp = await fetch(`${tsUrl}/torrents/add`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: `magnet=${encodeURIComponent(magnet)}`
            });
            if (!addResp.ok) throw new Error(`TS Add Error: ${addResp.status}`);
            const data = await addResp.json();
            
            const hash = data.hash || data.info_hash;
            if (!hash) throw new Error('Не получен хэш торрента');

            // Получаем список файлов
            const filesResp = await fetch(`${tsUrl}/torrents/${hash}/files`);
            const files = await filesResp.json();
            if (!files || !files.length) throw new Error('Файлы не найдены');

            // Ищем видеофайл (приоритет: mkv > mp4 > avi) или берем самый большой
            let videoFile = files.find(f => /\.mkv$/i.test(f.name)) || 
                            files.find(f => /\.mp4$/i.test(f.name)) || 
                            files[0];

            const streamUrl = `${tsUrl}/stream/${hash}/${videoFile.id}`;
            log('Stream URL:', streamUrl);
            return streamUrl;
        } catch (e) {
            errorLog('TorrServer ошибка:', e);
            Lampa.Notification.show('Ошибка TorrServer: ' + e.message, 4000);
            return null;
        }
    }

    async function playMovie(item) {
        if (!item.magnet) return Lampa.Notification.show('Нет magnet-ссылки', 3000);
        
        Lampa.Controller.enabled().status = false; // Блокируем пульт
        Lampa.Utils.putProgressUrl('Добавление в TorrServer...');
        
        const streamUrl = await addMagnetToTorrServer(item.magnet);
        Lampa.Utils.putProgressUrl('');
        Lampa.Controller.enabled().status = true;

        if (streamUrl) {
            Lampa.Player.play(streamUrl, { 
                title: item.title,
                // Подсказка для встроенного плеера Lampa, что это веб-поток
                subtitles: [] 
            });
        }
    }

    // ---------- Отображение списка (КАСТОМНЫЙ КОМПОНЕНТ LAMPA) ----------
    // Это гарантирует, что список будет работать с пультом и не сломает интерфейс
    function showTorrentList(items, categoryName) {
        if (!items.length) {
            Lampa.Notification.show('Список пуст', 3000);
            return;
        }

        Lampa.Activity.push({
            url: '',
            title: categoryName,
            component: 'rutor_list_component',
            page: 1,
            onBack: () => Lampa.Activity.back(),
            onCreate: function (activity) {
                let scroll = new Lampa.Scroll({ mask: true, over: true });
                let html_items = [];
                let controller = Lampa.Controller();

                activity.render().append(scroll.render());
                scroll.clear();

                // Создаем DOM элементы для каждого торрента
                items.forEach((item, idx) => {
                    let elem = document.createElement('div');
                    elem.className = 'torrent-list-item selector';
                    elem.style.cssText = `
                        padding: 1.2em 1.5em;
                        border-bottom: 1px solid rgba(255,255,255,0.1);
                        cursor: pointer;
                        transition: background 0.2s;
                    `;
                    
                    // Форматируем информацию
                    let infoHtml = `
                        <div style="color: rgba(255,255,255,0.9); font-size: 1.1em; line-height: 1.3; margin-bottom: 0.5em;">
                            ${item.title}
                        </div>
                        <div style="display: flex; color: rgba(255,255,255,0.5); font-size: 0.9em; gap: 1.5em;">
                            <span>📁 ${item.size}</span>
                            <span style="color: #4caf50;">👤 ${item.seeds}</span>
                            <span>🔽 ${item.leech}</span>
                            <span>📅 ${item.date}</span>
                        </div>
                    `;
                    elem.innerHTML = infoHtml;

                    // Подсветка при наведении (фокусе с пульта)
                    elem.onhover = () => elem.style.background = 'rgba(255,255,255,0.1)';
                    elem.onunhover = () => elem.style.background = 'transparent';

                    // Обработчик нажатия (ОК на пульте или клик мышью)
                    elem.onenter = () => playMovie(item);

                    html_items.push(elem);
                    scroll.append(elem);
                });

                // Подключаем управление с пульта ДУ
                controller.add('rutor_content', {
                    toggle: () => {
                        controller.collectionSet(html_items);
                        controller.collectionFocus(0, html_items[0]);
                    },
                    left: () => Lampa.Activity.back(),
                    right: () => {},
                    up: () => controller.move('up'),
                    down: () => controller.move('down'),
                    back: () => Lampa.Activity.back()
                });

                controller.toggle('rutor_content');
            },
            onDestroy: function () {
                Lampa.Controller.remove('rutor_content');
                // Скролл автоматически удаляется вместе с Activity
            }
        });
    }

    // ---------- Обработчик выбора категории ----------
    async function onCategorySelect(categoryKey) {
        Lampa.Notification.show('Загрузка списка...', 1500);
        const items = await loadRutorPage(categoryKey);
        showTorrentList(items, CATEGORIES[categoryKey].name);
    }

    // ---------- Модальное окно выбора категорий ----------
    function showCategoriesModal() {
        let $container = $('<div class="rutor-categories-container" style="display:flex; flex-wrap:wrap; justify-content:center; padding:20px;"></div>');
        let btns = [];

        for (const [key, cat] of Object.entries(CATEGORIES)) {
            let $btn = $(`
                <div class="simple-button selector" style="
                    background: linear-gradient(135deg, #2a2a3a, #1e1e2f);
                    border-radius: 12px; margin: 10px; padding: 18px 20px;
                    min-width: 200px; text-align: center; 
                    box-shadow: 0 4px 15px rgba(0,0,0,0.4);
                ">
                    <div style="font-size: 1.15em; font-weight: bold; color: #fff;">${cat.name}</div>
                </div>
            `);
            
            $btn.on('hover:enter', function () {
                Lampa.Modal.close();
                Lampa.Controller.remove('rutor_modal');
                onCategorySelect(key);
            });
            
            $container.append($btn);
            btns.push($btn);
        }

        // Кнопка настроек
        let $settingsBtn = $(`
            <div class="simple-button selector" style="
                background: linear-gradient(135deg, #3a2a1a, #2a1a1a);
                border-radius: 12px; margin: 10px; padding: 18px 20px;
                min-width: 200px; text-align: center;
            ">
                <div style="font-size: 1.15em; font-weight: bold; color: #ffaa00;">⚙️ Настройки</div>
            </div>
        `);
        $settingsBtn.on('hover:enter', () => {
            Lampa.Modal.close();
            Lampa.Controller.remove('rutor_modal');
            Lampa.SettingsApi.open('rutor_torr');
        });
        $container.append($settingsBtn);
        btns.push($settingsBtn);

        Lampa.Modal.open({
            title: 'Rutor.info',
            html: $container,
            size: 'full',
            onBack: () => {
                Lampa.Modal.close();
                Lampa.Controller.remove('rutor_modal');
                Lampa.Controller.toggle('menu');
            }
        });

        // Навигация пультом в модальном окне
        setTimeout(() => {
            Lampa.Controller.add('rutor_modal', {
                toggle: () => {
                    Lampa.Controller.collectionSet(btns);
                    Lampa.Controller.collectionFocus(0, btns[0]);
                },
                up: () => Lampa.Controller.move('up'),
                down: () => Lampa.Controller.move('down'),
                right: () => {},
                left: () => {},
                back: () => {
                    Lampa.Modal.close();
                    Lampa.Controller.remove('rutor_modal');
                    Lampa.Controller.toggle('menu');
                }
            });
            Lampa.Controller.toggle('rutor_modal');
        }, 150);
    }

    // ---------- Добавление кнопки в главное меню ----------
    function addMenuButton() {
        let $menu = $('.menu .menu__list').first();
        if (!$menu.length) return setTimeout(addMenuButton, 500);
        if ($('.menu__item.rutor-torr-menu-btn').length) return;

        let $btn = $(`
            <li class="menu__item selector rutor-torr-menu-btn">
                <div class="menu__ico">
                    <svg xmlns="http://www.w3.org/2000/svg" width="1.2em" height="1.2em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v8M8 12h8"/></svg>
                </div>
                <div class="menu__text">Rutor торренты</div>
            </li>
        `);
        
        $btn.on('hover:enter', showCategoriesModal);
        $menu.append($btn);
        log('Кнопка в меню добавлена');
    }

    // ---------- Настройки ----------
    function addSettingsComponent() {
        Lampa.SettingsApi.addComponent({
            component: 'rutor_torr',
            name: 'Rutor + TorrServer',
            icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10"/><path d="M12 8v8M8 12h8"/></svg>'
        });
        
        Lampa.SettingsApi.addParam({
            component: 'rutor_torr',
            param: { name: 'torrServerUrl', type: 'input', default: settings.torrServerUrl },
            field: { name: 'Адрес TorrServer', description: 'Например: http://192.168.1.100:8090' },
            onChange: (val) => { settings.torrServerUrl = val; saveSettings(); }
        });
        
        Lampa.SettingsApi.addParam({
            component: 'rutor_torr',
            param: { name: 'useProxy', type: 'trigger', default: settings.useProxy },
            field: { name: 'Использовать прокси TorrServer', description: 'ОБЯЗАТЕЛЬНО для обхода блокировки рутора' },
            onChange: (val) => { settings.useProxy = val; saveSettings(); }
        });
    }

    // ---------- Старт ----------
    function init() {
        loadSettings();
        addSettingsComponent();
        
        if (window.Lampa && Lampa.App && Lampa.App.ready) addMenuButton();
        else Lampa.Listener.follow('app', (e) => { if (e.type === 'ready') addMenuButton(); });
        
        log('Плагин инициализирован');
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();

})();
