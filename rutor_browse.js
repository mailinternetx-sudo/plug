(function() {
    'use strict';

    // === КОНФИГУРАЦИЯ ПЛАГИНА ===
    var PLUGIN_NAME = 'RUTOR1';
    var STORAGE_KEY = 'rutor_cache_v1';
    var CACHE_LIFETIME = 60 * 60 * 1000; // Кеш на 1 час
    
    // Адрес TorrServer (пустая строка означает использование адреса из настроек Lampa)
    var TORRSERVER_URL_OVERRIDE = ''; 

    // CSS стили для элементов UI (инлайн, чтобы не зависеть от внешних файлов)
    var STYLES = `
        .rutor-custom-card {
            display: flex;
            padding: 15px;
            border-bottom: 1px solid rgba(255,255,255,0.1);
            cursor: pointer;
            align-items: center;
        }
        .rutor-custom-card:hover {
            background-color: rgba(255, 255, 255, 0.1);
        }
        .rutor-poster-placeholder {
            width: 80px;
            height: 110px;
            background-color: #333;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #777;
            font-size: 10px;
            margin-right: 20px;
            flex-shrink: 0;
            background-size: cover;
            background-position: center;
        }
        .rutor-info {
            flex-grow: 1;
        }
        .rutor-title {
            font-size: 16px;
            font-weight: bold;
            color: #fff;
            margin-bottom: 5px;
        }
        .rutor-meta {
            font-size: 13px;
            color: #aaa;
        }
        .rutor-loader {
            text-align: center;
            padding: 50px;
            color: #fff;
        }
        .rutor-error {
            color: #ff4700;
            text-align: center;
            padding: 20px;
        }
    `;

    // SVG Иконка для меню
    var MENU_ICON_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>';

    // === ЛОГИКА ПЛАГИНА ===

    // Вспомогательная функция для XHR (Promise обертка над XMLHttpRequest)
    function makeRequest(method, url) {
        return new Promise(function(resolve, reject) {
            var xhr = new XMLHttpRequest();
            xhr.open(method, url, true);
            xhr.onload = function() {
                if (xhr.status >= 200 && xhr.status < 300) {
                    resolve(xhr.responseText);
                } else {
                    reject({
                        status: xhr.status,
                        statusText: xhr.statusText
                    });
                }
            };
            xhr.onerror = function() {
                reject({
                    status: xhr.status,
                    statusText: xhr.statusText
                });
            };
            xhr.send();
        });
    }

    // Работа с localStorage
    var Storage = {
        get: function(key) {
            try {
                var item = localStorage.getItem(key);
                return item ? JSON.parse(item) : null;
            } catch (e) {
                return null;
            }
        },
        set: function(key, value) {
            try {
                localStorage.setItem(key, JSON.stringify(value));
            } catch (e) {
                console.error('LocalStorage error', e);
            }
        },
        clear: function(key) {
            localStorage.removeItem(key);
        }
    };

    // Инициализация плагина
    function init() {
        if (typeof Lampa === 'undefined') {
            console.error('Lampa framework not found!');
            return;
        }

        // Внедряем стили
        var style = document.createElement('style');
        style.type = 'text/css';
        style.innerHTML = STYLES;
        document.head.appendChild(style);

        // Ждем готовности приложения
        Lampa.Listener.follow('app', function(e) {
            if (e.type === 'ready') {
                addMenuButton();
            }
        });
    }

    // Добавление кнопки в левое меню
    function addMenuButton() {
        var menuContainer = document.querySelector('.menu .menu__list');
        if (!menuContainer) return;

        var menuItem = document.createElement('div');
        menuItem.className = 'menu__item selector';
        menuItem.innerHTML = `
            <div class="menu__item-icon">${MENU_ICON_SVG}</div>
            <div class="menu__item-text">${PLUGIN_NAME}</div>
        `;

        // Обработчик нажатия
        menuItem.addEventListener('hover:enter', function() {
            showCategoriesScreen();
        });

        // Эмуляция hover событий для Lampa Controller
        Lampa.Controller.add('rutor_menu_item', {
            toggle: function() {
                showCategoriesScreen();
            }
        });

        menuContainer.appendChild(menuItem);
    }

    // Экран выбора категории
    function showCategoriesScreen() {
        var categories = [
            { title: 'Топ торренты (24ч)',  id: 'top',   url: '/top/24' },
            { title: 'Зарубежные фильмы',  id: 'f_mov', url: '/0/0/100/0/0' },
            { title: 'Наши фильмы',        id: 'r_mov', url: '/0/10/100/0/0' },
            { title: 'Зарубежные сериалы', id: 'f_ser', url: '/0/0/201/0/0' },
            { title: 'Наши сериалы',       id: 'r_ser', url: '/0/10/201/0/0' },
            { title: 'Телевизор',          id: 'tv',    url: '/0/0/3/0/0' }
        ];

        // Создаем объект элементов для Lampa
        var items = categories.map(function(cat) {
            return {
                title: cat.title,
                id: cat.id,
                url: cat.url,
                cat_obj: cat // Сохраняем исходные данные
            };
        });

        // Используем Activity API Lampa
        Lampa.Activity.push({
            url: '',
            title: PLUGIN_NAME,
            component: 'catalog_full',
            page: 1,
            items: items,
            onSelect: function(item) {
                showTorrentsList(item);
            }
        });
    }

    // Экран списка торрентов
    function showTorrentsList(categoryItem) {
        // Блокируем контроллер контента
        Lampa.Controller.enabled().content = false;

        Lampa.Activity.push({
            url: '',
            title: categoryItem.title,
            component: 'catalog_full',
            page: 1,
            items: [],
            onCreate: function(bindObj) {
                // bindObj - это объект с методами render(), append() и т.д.
                
                // 1. Показываем лоадер
                var loaderHtml = '<div class="rutor-loader">Загрузка данных с RuTor...</div>';
                bindObj.render().innerHTML = loaderHtml;

                // 2. Проверяем кеш
                var cacheData = Storage.get(STORAGE_KEY + '_' + categoryItem.id);
                var now = Date.now();

                if (cacheData && (now - cacheData.timestamp < CACHE_LIFETIME)) {
                    renderResults(cacheData.data, bindObj);
                } else {
                    // 3. Загружаем данные
                    loadAndParse(categoryItem.url, bindObj, categoryItem.id);
                }
            }
        });
    }

    // Загрузка через XHR и парсинг
    function loadAndParse(relativeUrl, bindObj, catId) {
        var baseUrl = 'http://rutor.info';
        var targetUrl = baseUrl + relativeUrl;
        
        // Пробуем определить TorrServer для проксирования (если нужно)
        var tsUrl = Lampa.Storage.get('torrserver_url') || TORRSERVER_URL_OVERRIDE;
        // Если TorrServer имеет прокси (зависит от сборки), можно попробовать путь:
        // targetUrl = (tsUrl || 'http://localhost:8090') + '/proxy/' + targetUrl.replace('://', '/');

        makeRequest('GET', targetUrl)
            .then(function(htmlString) {
                var movies = parseRutorHtml(htmlString);
                
                if (movies.length > 0) {
                    // Сохраняем в кеш
                    Storage.set(STORAGE_KEY + '_' + catId, {
                        data: movies,
                        timestamp: Date.now()
                    });
                    renderResults(movies, bindObj);
                } else {
                    bindObj.render().innerHTML = '<div class="rutor-error">Список пуст или парсинг не удался. Возможно, сайт изменил верстку.</div>';
                }
            })
            .catch(function(err) {
                console.error('RUTOR1 Error:', err);
                bindObj.render().innerHTML = '<div class="rutor-error">Ошибка сети или блокировка CORS (проверьте TorrServer).</div>';
            });
    }

    // Парсинг HTML строки с помощью DOMParser
    function parseRutorHtml(html) {
        var parser = new DOMParser();
        var doc = parser.parseFromString(html, 'text/html');
        var result = [];

        // Селекторы таблиц rutor (основная таблица)
        var rows = doc.querySelectorAll('#index tr');

        rows.forEach(function(tr) {
            // Пропускаем заголовок таблицы
            if (tr.querySelector('th')) return;

            var tds = tr.querySelectorAll('td');
            if (tds.length < 5) return; // Нужно минимум 5 колонок

            // 2-я колонка - Ссылка
            var linkTag = tds[1].querySelector('a');
            if (!linkTag) return;

            var title = linkTag.textContent.trim();
            var detailHref = linkTag.getAttribute('href');

            // 3-я колонка - Размер
            var sizeTag = tds[2].querySelector('span');
            var size = sizeTag ? sizeTag.textContent.trim() : '';

            // 5-я колонка - Сиды
            var seeds = 0;
            var seedsTag = tds[4];
            if (seedsTag) {
                var sTxt = seedsTag.textContent.trim();
                // Иногда там написано "S: 123", иногда просто число
                seeds = parseInt(sTxt.replace(/\D/g, '')) || 0;
            }

            if (title && detailHref) {
                result.push({
                    title: title,
                    url: 'http://rutor.info' + detailHref,
                    size: size,
                    seeds: seeds
                });
            }
        });

        return result;
    }

    // Отрисовка результатов (создание UI элементов)
    function renderResults(movies, bindObj) {
        var container = document.createElement('div');
        container.className = 'rutor-results-container';

        if (!movies || movies.length === 0) {
            bindObj.render().innerHTML = '<div class="rutor-error">Нет данных</div>';
            return;
        }

        movies.forEach(function(movie) {
            var card = document.createElement('div');
            card.className = 'rutor-custom-card selector';

            // Генерация плейсхолдера или поиск картинки (сложно без доп.запросов, ставим цветной блок)
            // Можно попытаться взять картинку из тега img если она есть в таблице rutor (обычно нет)
            
            var html = `
                <div class="rutor-poster-placeholder" style="background-color: ${stringToColor(movie.title)}">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"></rect><line x1="7" y1="2" x2="7" y2="22"></line><line x1="17" y1="2" x2="17" y2="22"></line><line x1="2" y1="12" x2="22" y2="12"></line><line x1="2" y1="7" x2="7" y2="7"></line><line x1="2" y1="17" x2="7" y2="17"></line><line x1="17" y1="17" x2="22" y2="17"></line><line x1="17" y1="7" x2="22" y2="7"></line></svg>
                </div>
                <div class="rutor-info">
                    <div class="rutor-title">${movie.title}</div>
                    <div class="rutor-meta">Размер: ${movie.size} | Сиды: ${movie.seeds}</div>
                </div>
            `;
            
            card.innerHTML = html;

            // Обработчик клика/наведения
            card.addEventListener('hover:enter', function() {
                playTorrent(movie);
            });

            container.appendChild(card);
        });

        // Очищаем контейнер бинда и вставляем наши элементы
        bindObj.render().innerHTML = '';
        bindObj.append(container);
        
        // Скроллим наверх
        if (bindObj.scroll) bindObj.scroll.reset();
    }

    // Воспроизведение
    function playTorrent(movie) {
        // Показываем модалку "Загрузка"
        Lampa.Modal.open({
            title: movie.title,
            html: '<div style="padding:20px;">Получение magnet-ссылки...</div>',
            onBack: function() {
                Lampa.Modal.close();
                return false;
            }
        });

        // Загружаем детальную страницу, чтобы найти magnet
        makeRequest('GET', movie.url)
            .then(function(html) {
                var parser = new DOMParser();
                var doc = parser.parseFromString(html, 'text/html');
                var magnetLink = doc.querySelector('a[href^="magnet:"]');

                if (magnetLink) {
                    startStream(magnetLink.getAttribute('href'), movie.title);
                } else {
                    Lampa.Modal.close();
                    Lampa.Noty.show('Magnet ссылка не найдена');
                }
            })
            .catch(function(err) {
                Lampa.Modal.close();
                Lampa.Noty.show('Ошибка загрузки страницы торрента');
            });
    }

    function startStream(magnet, title) {
        Lampa.Modal.close();
        
        var tsUrl = TORRSERVER_URL_OVERRIDE || Lampa.Storage.get('torrserver_url');
        if (!tsUrl) {
            Lampa.Noty.show('Не указан TorrServer');
            return;
        }
        
        // Убираем слеш в конце
        tsUrl = tsUrl.replace(/\/$/, '');

        // Формируем ссылку на стрим
        // Добавляем save_to_db=true для сохранения в базе TorrServer
        var streamUrl = tsUrl + '/streams?url=' + encodeURIComponent(magnet) + '&title=' + encodeURIComponent(title) + '&save_to_db=true';

        console.log('RUTOR1 Play:', streamUrl);

        // Подготовка объекта для Lampa Player
        var video = {
            title: title,
            url: streamUrl,
            timeline: [],
            movie: {
                id: 'rutor1_' + Date.now(),
                title: title,
                source: PLUGIN_NAME
            }
        };

        // Запуск
        Lampa.Player.play(video);
        Lampa.Player.playlist([video]);
    }

    // Утилита: Генерация цвета из строки (для заглушек постеров)
    function stringToColor(str) {
        var hash = 0;
        for (var i = 0; i < str.length; i++) {
            hash = str.charCodeAt(i) + ((hash << 5) - hash);
        }
        var c = (hash & 0x00FFFFFF).toString(16).toUpperCase();
        return '#' + '00000'.substring(0, 6 - c.length) + c;
    }

    // Запуск
    init();

})();
