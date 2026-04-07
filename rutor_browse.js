(function () {
    'use strict';

    // ============================================================
    //  Плагин Rutor для Lampa с поддержкой TorrServer
    //  Версия 1.0.0
    // ============================================================

    const PLUGIN_NAME = 'RutorTorr';
    const PLUGIN_VERSION = '1.0.0';
    const DEBUG = true; // Включить отладку в консоли

    // ---------- Конфигурация категорий rutor.info ----------
    // ID категорий на сайте rutor.info (по состоянию на 2025 год)
    const CATEGORIES = {
        top24: {          // Топ торренты за 24 часа
            id: 0,        // Особый случай: главная страница с топом
            name: 'Топ торренты за 24 часа',
            url: '/'
        },
        foreign_movies: { // Зарубежные фильмы
            id: 4,
            name: 'Зарубежные фильмы',
            url: '/browse/4'
        },
        our_movies: {     // Наши фильмы
            id: 3,
            name: 'Наши фильмы',
            url: '/browse/3'
        },
        foreign_series: { // Зарубежные сериалы
            id: 2,
            name: 'Зарубежные сериалы',
            url: '/browse/2'
        },
        our_series: {     // Наши сериалы
            id: 1,
            name: 'Наши сериалы',
            url: '/browse/1'
        },
        tv: {             // Телевизор (ТВ-передачи, шоу)
            id: 5,
            name: 'Телевизор',
            url: '/browse/5'
        }
    };

    // ---------- Настройки плагина ----------
    let settings = {
        enabled: true,
        torrServerUrl: 'http://127.0.0.1:8090',  // Адрес TorrServer (можно переопределить в настройках Lampa)
        useProxy: false                           // Использовать проксирование через TorrServer
    };

    const STORAGE_KEY = 'rutor_torr_settings';

    // ---------- Вспомогательные функции ----------
    function log(...args) {
        if (DEBUG) console.log(`[${PLUGIN_NAME}]`, ...args);
    }

    function errorLog(...args) {
        console.error(`[${PLUGIN_NAME}]`, ...args);
    }

    // Загрузка настроек из localStorage
    function loadSettings() {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            try {
                const obj = JSON.parse(saved);
                Object.assign(settings, obj);
                log('Настройки загружены:', settings);
            } catch (e) {
                errorLog('Ошибка загрузки настроек', e);
            }
        }
    }

    // Сохранение настроек
    function saveSettings() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
        log('Настройки сохранены');
    }

    // Получить URL с проксированием через TorrServer (если включено)
    function getProxiedUrl(url) {
        if (settings.useProxy && settings.torrServerUrl) {
            // TorrServer прокси: /proxy/?url=...
            return `${settings.torrServerUrl}/proxy/?url=${encodeURIComponent(url)}`;
        }
        return url;
    }

    // ---------- Парсинг HTML rutor.info ----------
    // Извлекаем список раздач из HTML страницы
    function parseRutorPage(html, categoryName) {
        const items = [];
        // Создаём временный DOM элемент для парсинга
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        
        // На rutor.info таблица с классом 'tablesaw' или 'table'
        // Селектор строк: tr:has(td:first-child a[href*="/torrent/"])
        const rows = doc.querySelectorAll('tr');
        if (!rows.length) {
            errorLog('Не найдены строки в HTML, возможно изменилась структура сайта');
            return items;
        }

        rows.forEach(row => {
            const titleCell = row.querySelector('td:nth-child(2) a');
            if (!titleCell) return;
            
            const title = titleCell.textContent.trim();
            const magnetLink = row.querySelector('td:nth-child(3) a[href^="magnet:"]')?.getAttribute('href');
            if (!title || !magnetLink) return;
            
            // Размер (обычно в 4-м столбце)
            const sizeCell = row.querySelector('td:nth-child(4)');
            const size = sizeCell ? sizeCell.textContent.trim() : 'N/A';
            
            // Сидеры (5-й столбец)
            const seedsCell = row.querySelector('td:nth-child(5)');
            const seeds = seedsCell ? seedsCell.textContent.trim() : '0';
            
            // Личеры (6-й столбец)
            const leechCell = row.querySelector('td:nth-child(6)');
            const leech = leechCell ? leechCell.textContent.trim() : '0';
            
            // Дата (1-й столбец)
            const dateCell = row.querySelector('td:nth-child(1)');
            const date = dateCell ? dateCell.textContent.trim() : '';
            
            items.push({
                title: title,
                magnet: magnetLink,
                size: size,
                seeds: seeds,
                leech: leech,
                date: date,
                category: categoryName
            });
        });
        
        log(`Найдено ${items.length} раздач в категории "${categoryName}"`);
        return items;
    }

    // ---------- Загрузка страницы rutor.info (с прокси или без) ----------
    async function loadRutorPage(categoryKey) {
        const cat = CATEGORIES[categoryKey];
        if (!cat) {
            errorLog('Неизвестная категория', categoryKey);
            return [];
        }
        
        let url = `https://rutor.info${cat.url}`;
        // Для топа за 24 часа используем главную страницу, но нужны именно свежие торренты
        if (categoryKey === 'top24') {
            url = 'https://rutor.info/'; // главная страница уже показывает топ за 24ч
        }
        
        const proxiedUrl = getProxiedUrl(url);
        log(`Загрузка: ${proxiedUrl}`);
        
        try {
            const response = await fetch(proxiedUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                }
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const html = await response.text();
            const items = parseRutorPage(html, cat.name);
            return items;
        } catch (e) {
            errorLog('Ошибка загрузки страницы rutor:', e);
            // Если не удалось и используется прокси, возможно CORS блокирует.
            // Предлагаем включить проксирование через TorrServer.
            if (!settings.useProxy) {
                errorLog('Попробуйте включить опцию "Использовать прокси TorrServer" в настройках плагина');
            }
            return [];
        }
    }

    // ---------- Воспроизведение через TorrServer ----------
    // Добавляем magnet в TorrServer и получаем ссылку на первый видеофайл
    async function addMagnetToTorrServer(magnet) {
        const tsUrl = settings.torrServerUrl;
        if (!tsUrl) {
            errorLog('TorrServer адрес не задан');
            return null;
        }
        
        try {
            // 1. Добавляем торрент
            const addUrl = `${tsUrl}/torrents/add?magnet=${encodeURIComponent(magnet)}`;
            log('Добавление торрента:', addUrl);
            const addResp = await fetch(addUrl, { method: 'GET' }); // или POST в зависимости от версии TS
            if (!addResp.ok) throw new Error('Ошибка добавления торрента');
            const data = await addResp.json();
            const hash = data.hash || data.info_hash;
            if (!hash) {
                errorLog('Не получен хэш торрента', data);
                return null;
            }
            log('Торрент добавлен, хэш:', hash);
            
            // 2. Получаем список файлов
            const filesUrl = `${tsUrl}/torrents/${hash}/files`;
            const filesResp = await fetch(filesUrl);
            const files = await filesResp.json();
            if (!files || !files.length) {
                errorLog('Нет файлов в торренте');
                return null;
            }
            
            // Ищем первый видеофайл (можно расширить поиск)
            let videoIndex = -1;
            for (let i = 0; i < files.length; i++) {
                const name = files[i].name.toLowerCase();
                if (name.endsWith('.mkv') || name.endsWith('.mp4') || name.endsWith('.avi') || name.endsWith('.ts')) {
                    videoIndex = i;
                    break;
                }
            }
            if (videoIndex === -1) videoIndex = 0; // берём первый файл
            
            // 3. Ссылка для воспроизведения
            const streamUrl = `${tsUrl}/stream/${hash}/${videoIndex}`;
            log('Stream URL:', streamUrl);
            return streamUrl;
        } catch (e) {
            errorLog('Ошибка взаимодействия с TorrServer', e);
            return null;
        }
    }
    
    // Запуск воспроизведения фильма
    async function playMovie(item) {
        if (!item.magnet) {
            errorLog('Нет magnet-ссылки');
            Lampa.Notification.show('Нет magnet-ссылки для этого торрента', 3000);
            return;
        }
        
        // Показываем уведомление о начале буферизации
        Lampa.Notification.show('Добавление в TorrServer...', 2000);
        
        const streamUrl = await addMagnetToTorrServer(item.magnet);
        if (streamUrl) {
            // Запускаем плеер Lampa
            Lampa.Player.play(streamUrl, {
                title: item.title,
                poster: item.poster || '',
                // Можно добавить дополнительные параметры
            });
        } else {
            Lampa.Notification.show('Не удалось воспроизвести торрент', 4000);
        }
    }

    // ---------- Отображение списка фильмов в Lampa ----------
    // Формируем объекты для компонента каталога Lampa
    function showCatalog(items, categoryName) {
        if (!items.length) {
            Lampa.Notification.show(`В категории "${categoryName}" ничего не найдено`, 3000);
            return;
        }
        
        // Преобразуем в формат, понятный Lampa
        const catalogItems = items.map((item, idx) => {
            // Пытаемся извлечь год из названия (часто в скобках)
            let year = '';
            const yearMatch = item.title.match(/\((\d{4})\)/);
            if (yearMatch) year = yearMatch[1];
            
            // Генерируем псевдо-постер (можно позже добавить загрузку реальных постеров)
            const poster = `https://via.placeholder.com/300x450/1a1a2e/ffffff?text=${encodeURIComponent(item.title.substring(0, 20))}`;
            
            return {
                id: `rutor_${Date.now()}_${idx}`,
                title: item.title,
                year: year,
                poster: poster,
                description: `Размер: ${item.size} | Сидеры: ${item.seeds} | Личеры: ${item.leech}\nДата: ${item.date}`,
                magnet: item.magnet,
                // Доп. данные для воспроизведения
                torrent_magnet: item.magnet,
                torrent_size: item.size,
                seeds: item.seeds
            };
        });
        
        // Используем стандартный компонент каталога Lampa
        Lampa.Activity.push({
            url: '',
            title: categoryName,
            component: 'catalog',
            catalog: {
                items: catalogItems,
                source: {
                    title: categoryName,
                    poster: 'https://rutor.info/favicon.ico'
                }
            },
            onSelect: (item) => {
                // При клике на элемент вызываем воспроизведение
                playMovie({
                    title: item.title,
                    magnet: item.magnet,
                    size: item.torrent_size
                });
            }
        });
    }

    // ---------- Обработчик выбора категории ----------
    async function onCategorySelect(categoryKey) {
        log('Выбрана категория:', categoryKey);
        // Показываем индикатор загрузки
        Lampa.Notification.show('Загрузка списка...', 2000);
        const items = await loadRutorPage(categoryKey);
        if (items.length) {
            showCatalog(items, CATEGORIES[categoryKey].name);
        } else {
            Lampa.Notification.show('Не удалось загрузить данные. Проверьте соединение или настройки прокси.', 5000);
        }
    }

    // ---------- Создание модального окна с категориями ----------
    function showCategoriesModal() {
        // Создаём контейнер для кнопок категорий
        const $container = $('<div class="rutor-categories-container" style="display:flex; flex-wrap:wrap; justify-content:center; padding:20px;"></div>');
        
        // Для каждой категории создаём кнопку
        Object.keys(CATEGORIES).forEach(key => {
            const cat = CATEGORIES[key];
            const $btn = $(`
                <div class="rutor-category-btn selector" data-category="${key}" style="
                    background: linear-gradient(135deg, #1e1e2f, #2a2a3a);
                    border-radius: 16px;
                    margin: 12px;
                    padding: 16px 24px;
                    min-width: 180px;
                    text-align: center;
                    cursor: pointer;
                    transition: transform 0.2s, box-shadow 0.2s;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                ">
                    <div style="font-size: 1.2em; font-weight: bold; color: #fff;">${cat.name}</div>
                    <div style="font-size: 0.8em; color: #aaa;">Категория ${cat.id}</div>
                </div>
            `);
            $btn.on('hover:enter', function() {
                const category = $(this).data('category');
                Lampa.Modal.close();
                onCategorySelect(category);
            });
            $container.append($btn);
        });
        
        // Добавляем кнопку настроек (быстрый доступ)
        const $settingsBtn = $(`
            <div class="rutor-category-btn selector" style="
                background: linear-gradient(135deg, #3a2a2a, #2a1a1a);
                border-radius: 16px;
                margin: 12px;
                padding: 16px 24px;
                min-width: 180px;
                text-align: center;
                cursor: pointer;
            ">
                <div style="font-size: 1.2em; font-weight: bold; color: #ffaa00;">⚙️ Настройки</div>
                <div style="font-size: 0.8em; color: #ccc;">TorrServer и прокси</div>
            </div>
        `);
        $settingsBtn.on('hover:enter', function() {
            Lampa.Modal.close();
            // Открываем настройки плагина (если есть компонент настроек)
            Lampa.SettingsApi.open('rutor_torr');
        });
        $container.append($settingsBtn);
        
        // Открываем модальное окно
        Lampa.Modal.open({
            title: 'Rutor.info торренты',
            html: $container,
            size: 'full',
            onBack: () => {
                Lampa.Modal.close();
                Lampa.Controller.toggle('menu');
            }
        });
        
        // Добавляем стили для фокуса (навигация пультом)
        setTimeout(() => {
            const $btns = $container.find('.selector');
            if ($btns.length) {
                let currentFocus = 0;
                const updateFocus = (index) => {
                    $btns.removeClass('focus');
                    $btns.eq(index).addClass('focus').attr('tabindex', '0').focus();
                    currentFocus = index;
                };
                $btns.on('focus', function() {
                    $btns.removeClass('focus');
                    $(this).addClass('focus');
                });
                updateFocus(0);
                Lampa.Controller.add('rutor_categories', {
                    toggle: () => {
                        Lampa.Controller.collectionSet($btns);
                        updateFocus(currentFocus);
                    },
                    up: () => {
                        let newIdx = currentFocus - 1;
                        if (newIdx < 0) newIdx = $btns.length - 1;
                        updateFocus(newIdx);
                    },
                    down: () => {
                        let newIdx = currentFocus + 1;
                        if (newIdx >= $btns.length) newIdx = 0;
                        updateFocus(newIdx);
                    },
                    left: () => {},
                    right: () => {},
                    back: () => {
                        Lampa.Modal.close();
                        Lampa.Controller.toggle('menu');
                    },
                    enter: () => {
                        $btns.eq(currentFocus).trigger('hover:enter');
                    }
                });
                Lampa.Controller.toggle('rutor_categories');
            }
        }, 100);
    }

    // ---------- Добавление кнопки в левое меню Lampa ----------
    let menuButtonAdded = false;
    function addMenuButton() {
        if (menuButtonAdded) return;
        const $menu = $('.menu .menu__list').first();
        if (!$menu.length) {
            log('Меню не найдено, повторим через 0.5с');
            setTimeout(addMenuButton, 500);
            return;
        }
        
        // Иконка для кнопки (символ R)
        const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1.2em" height="1.2em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v8M8 12h8"/></svg>`;
        
        const $btn = $(`
            <li class="menu__item selector rutor-torr-menu-btn">
                <div class="menu__ico">${iconSvg}</div>
                <div class="menu__text">Rutor торренты</div>
            </li>
        `);
        $btn.on('hover:enter', function() {
            showCategoriesModal();
        });
        $menu.append($btn);
        menuButtonAdded = true;
        log('Кнопка добавлена в меню');
    }

    // ---------- Настройки плагина (интеграция в Lampa.SettingsApi) ----------
    function addSettingsComponent() {
        Lampa.SettingsApi.addComponent({
            component: 'rutor_torr',
            name: 'Rutor + TorrServer',
            icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/><path d="M12 8v8M8 12h8" stroke="currentColor" stroke-width="2"/></svg>'
        });
        
        // Адрес TorrServer
        Lampa.SettingsApi.addParam({
            component: 'rutor_torr',
            param: {
                name: 'torrServerUrl',
                type: 'input',
                default: settings.torrServerUrl
            },
            field: {
                name: 'Адрес TorrServer',
                description: 'Например: http://127.0.0.1:8090'
            },
            onChange: (val) => {
                settings.torrServerUrl = val;
                saveSettings();
            }
        });
        
        // Использовать проксирование через TorrServer для обхода CORS
        Lampa.SettingsApi.addParam({
            component: 'rutor_torr',
            param: {
                name: 'useProxy',
                type: 'trigger',
                default: settings.useProxy
            },
            field: {
                name: 'Использовать прокси TorrServer',
                description: 'Включите, если rutor.info не загружается из-за CORS'
            },
            onChange: (val) => {
                settings.useProxy = val;
                saveSettings();
            }
        });
        
        // Кнопка "О плагине"
        Lampa.SettingsApi.addParam({
            component: 'rutor_torr',
            param: { type: 'button', component: 'about' },
            field: { name: 'О плагине', description: `Версия ${PLUGIN_VERSION}. Парсит rutor.info и воспроизводит через TorrServer.` },
            onChange: () => {
                Lampa.Modal.open({
                    title: 'О плагине',
                    html: `<div style="padding:20px; text-align:center;">
                        <h2>${PLUGIN_NAME}</h2>
                        <p>Версия ${PLUGIN_VERSION}</p>
                        <p>Плагин для Lampa Media Center</p>
                        <p>Загружает списки торрентов с rutor.info и воспроизводит через TorrServer.</p>
                        <p>При проблемах с CORS включите проксирование через TorrServer в настройках.</p>
                        <hr>
                        <p style="font-size:0.8em;">Не забудьте запустить TorrServer отдельно.</p>
                    </div>`,
                    size: 'small'
                });
            }
        });
    }

    // ---------- Инициализация плагина ----------
    function init() {
        loadSettings();
        addSettingsComponent();
        
        // Ждём готовности Lampa
        Lampa.Listener.follow('app', (e) => {
            if (e.type === 'ready') {
                log('Lampa готова, добавляем кнопку');
                addMenuButton();
            }
        });
        
        // Также на случай, если меню уже существует
        if (window.Lampa && window.Lampa.App && window.Lampa.App.ready) {
            addMenuButton();
        }
        
        log('Плагин инициализирован');
    }
    
    // Запускаем инициализацию после загрузки DOM
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
    
    // Экспорт глобального объекта (опционально)
    window.RutorTorrPlugin = {
        name: PLUGIN_NAME,
        version: PLUGIN_VERSION,
        settings: settings
    };
    
})();
