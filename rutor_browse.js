(function() {
    'use strict';

    // === КОНФИГУРАЦИЯ ===
    var PLUGIN_NAME = 'RUTOR1';
    var STORAGE_KEY = 'rutor_cache_v2'; // Обновили ключ кеша
    var CACHE_LIFETIME = 60 * 60 * 1000; 
    var TORRSERVER_URL_OVERRIDE = ''; 

    // Стили
    var STYLES = `
        .rutor-custom-card {
            display: flex;
            padding: 15px;
            border-bottom: 1px solid rgba(255,255,255,0.1);
            cursor: pointer;
            align-items: center;
        }
        .rutor-custom-card:hover { background-color: rgba(255, 255, 255, 0.1); }
        .rutor-poster-placeholder {
            width: 80px; height: 110px; background-color: #333;
            display: flex; align-items: center; justify-content: center;
            color: #777; font-size: 10px; margin-right: 20px; flex-shrink: 0;
            background-size: cover; background-position: center;
        }
        .rutor-info { flex-grow: 1; }
        .rutor-title { font-size: 16px; font-weight: bold; color: #fff; margin-bottom: 5px; }
        .rutor-meta { font-size: 13px; color: #aaa; }
        .rutor-loader { text-align: center; padding: 50px; color: #fff; }
        .rutor-error { color: #ff4700; text-align: center; padding: 20px; }
    `;

    // SVG
    var MENU_ICON_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>';

    // === ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ===
    
    // XHR Promise Wrapper
    function makeRequest(method, url) {
        return new Promise(function(resolve, reject) {
            var xhr = new XMLHttpRequest();
            xhr.open(method, url, true);
            xhr.onload = function() {
                if (xhr.status >= 200 && xhr.status < 300) {
                    resolve(xhr.responseText);
                } else {
                    reject({ status: xhr.status, statusText: xhr.statusText });
                }
            };
            xhr.onerror = function() { reject({ status: 0, statusText: 'Network Error' }); };
            xhr.send();
        });
    }

    // LocalStorage
    var Storage = {
        get: function(key) {
            try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; }
        },
        set: function(key, val) {
            try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
        }
    };

    // Инициализация
    function init() {
        if (typeof Lampa === 'undefined') return;
        var style = document.createElement('style');
        style.innerHTML = STYLES;
        document.head.appendChild(style);

        Lampa.Listener.follow('app', function(e) {
            if (e.type === 'ready') addMenuButton();
        });
    }

    // Кнопка меню
    function addMenuButton() {
        var container = document.querySelector('.menu .menu__list');
        if (!container) return;
        var item = document.createElement('div');
        item.className = 'menu__item selector';
        item.innerHTML = '<div class="menu__item-icon">' + MENU_ICON_SVG + '</div><div class="menu__item-text">' + PLUGIN_NAME + '</div>';
        item.addEventListener('hover:enter', showCategoriesScreen);
        container.appendChild(item);
    }

    // Экран категорий
    function showCategoriesScreen() {
        var categories = [
            { title: 'Топ (24ч)', id: 'top', url: '/top/24' },
            { title: 'Зарубежные фильмы', id: 'f_mov', url: '/0/0/100/0/0' },
            { title: 'Наши фильмы', id: 'r_mov', url: '/0/10/100/0/0' },
            { title: 'Зарубежные сериалы', id: 'f_ser', url: '/0/0/201/0/0' },
            { title: 'Наши сериалы', id: 'r_ser', url: '/0/10/201/0/0' },
            { title: 'Телевизор', id: 'tv', url: '/0/0/3/0/0' }
        ];

        Lampa.Activity.push({
            url: '', title: PLUGIN_NAME, component: 'catalog_full', page: 1,
            items: categories.map(function(c) { return { title: c.title, url: c.url, id: c.id }; }),
            onSelect: function(it) { showTorrentsList(it); }
        });
    }

    // Экран списка
    function showTorrentsList(catItem) {
        Lampa.Controller.enabled().content = false;
        Lampa.Activity.push({
            url: '', title: catItem.title, component: 'catalog_full', page: 1, items: [],
            onCreate: function(bind) {
                bind.render().innerHTML = '<div class="rutor-loader">Поиск торрентов...</div>';
                var cached = Storage.get(STORAGE_KEY + '_' + catItem.id);
                if (cached && Date.now() - cached.time < CACHE_LIFETIME) {
                    renderResults(cached.data, bind);
                } else {
                    loadAndParse(catItem.url, bind, catItem.id);
                }
            }
        });
    }

    // ЗАГРУЗКА И ПАРСИНГ (ИСПРАВЛЕННЫЙ)
    function loadAndParse(path, bind, catId) {
        var url = 'http://rutor.info' + path;
        
        makeRequest('GET', url).then(function(html) {
            var movies = parseRutorHtml(html);
            
            if (movies.length > 0) {
                Storage.set(STORAGE_KEY + '_' + catId, { data: movies, time: Date.now() });
                renderResults(movies, bind);
            } else {
                // Проверка на "ничего не найдено"
                var parser = new DOMParser();
                var doc = parser.parseFromString(html, 'text/html');
                var bodyText = doc.body ? doc.body.innerText.toLowerCase() : '';
                
                if (bodyText.indexOf('ничего не найдено') > -1 || bodyText.indexOf('nothing found') > -1) {
                    bind.render().innerHTML = '<div class="rutor-error">По вашему запросу ничего не найдено на сайте.</div>';
                } else {
                    console.error('RUTOR: Парсер не нашел элементов. HTML:', html.substring(0, 500));
                    bind.render().innerHTML = '<div class="rutor-error">Список пуст. Возможно, изменилась верстка сайта или заблокирован CORS.</div>';
                }
            }
        }).catch(function(e) {
            console.error('RUTOR: Network error', e);
            bind.render().innerHTML = '<div class="rutor-error">Ошибка сети. Убедитесь, что TorrServer работает или есть интернет.</div>';
        });
    }

    // УЛУЧШЕННЫЙ ПАРСЕР
    function parseRutorHtml(html) {
        var parser = new DOMParser();
        var doc = parser.parseFromString(html, 'text/html');
        var res = [];
        
        // Пытаемся найти таблицу по ID
        var table = doc.getElementById('index');
        if (!table) {
            console.warn('RUTOR: Table #index not found');
            return [];
        }

        var rows = table.querySelectorAll('tr');
        
        rows.forEach(function(tr) {
            // Пропускаем шапку
            if (tr.querySelector('th')) return;

            // --- СЛОЖНАЯ ЛОГИКА СЕЛЕКТОРОВ ---
            // rutor часто меняет порядок колонок. 
            // Ссылка обычно во 2-й или 3-й ячейке.
            var tds = tr.querySelectorAll('td');
            if (tds.length < 4) return;

            var linkTag = null;
            var sizeTag = null;
            var seedsTag = null;

            // Поиск ссылки (ищем ячейку с тегом <a>)
            for (var i = 0; i < tds.length; i++) {
                var a = tds[i].querySelector('a');
                if (a && a.href.indexOf('/torrent/') !== -1) {
                    linkTag = a;
                    // Обычно ссылка - это первая ячейка с контентом, после неё идет размер.
                    // Попробуем взять следующую ячейку как размер, если это возможно.
                    if (tds[i+1]) sizeTag = tds[i+1].querySelector('span');
                    // Сиды обычно в конце
                    if (tds[tds.length-1]) seedsTag = tds[tds.length-1];
                    break;
                }
            }
            
            // Если по ссылке не нашли, пробуем старый жесткий метод (ячейка 2)
            if (!linkTag) {
                if (tds[1]) linkTag = tds[1].querySelector('a');
                if (tds[2]) sizeTag = tds[2].querySelector('span');
                if (tds[4]) seedsTag = tds[4];
            }

            if (linkTag) {
                var title = linkTag.innerText.trim();
                var href = linkTag.getAttribute('href');
                var size = sizeTag ? sizeTag.innerText.trim() : '';
                var seeds = seedsTag ? parseInt(seedsTag.innerText.replace(/\D/g, '')) || 0 : 0;

                if (title && href) {
                    res.push({
                        title: title,
                        url: 'http://rutor.info' + href,
                        size: size,
                        seeds: seeds
                    });
                }
            }
        });

        console.log('RUTOR: Parsed ' + res.length + ' items');
        return res;
    }

    // Рендер
    function renderResults(movies, bind) {
        if (!movies.length) {
            bind.render().innerHTML = '<div class="rutor-error">Список пуст</div>';
            return;
        }
        
        var cont = document.createElement('div');
        movies.forEach(function(m) {
            var el = document.createElement('div');
            el.className = 'rutor-custom-card selector';
            el.innerHTML = `
                <div class="rutor-poster-placeholder" style="background-color: ${stringToColor(m.title)}"></div>
                <div class="rutor-info">
                    <div class="rutor-title">${m.title}</div>
                    <div class="rutor-meta">${m.size} | ${m.seeds} сидов</div>
                </div>`;
            el.addEventListener('hover:enter', function() { playTorrent(m); });
            cont.appendChild(el);
        });
        bind.render().innerHTML = '';
        bind.append(cont);
    }

    // Play
    function playTorrent(m) {
        Lampa.Modal.open({ title: m.title, html: '<div style="padding:20px;">Загрузка magnet...</div>', onBack: function(){Lampa.Modal.close();return false;} });
        
        makeRequest('GET', m.url).then(function(html) {
            var doc = new DOMParser().parseFromString(html, 'text/html');
            var mag = doc.querySelector('a[href^="magnet:"]');
            if (mag) {
                startStream(mag.getAttribute('href'), m.title);
            } else {
                Lampa.Modal.close(); Lampa.Noty.show('Magnet не найден');
            }
        }).catch(function(){ Lampa.Modal.close(); Lampa.Noty.show('Ошибка сети'); });
    }

    function startStream(magnet, title) {
        Lampa.Modal.close();
        var ts = TORRSERVER_URL_OVERRIDE || Lampa.Storage.get('torrserver_url');
        if (!ts) return Lampa.Noty.show('Нет TorrServer');
        ts = ts.replace(/\/$/, '');
        var url = ts + '/streams?url=' + encodeURIComponent(magnet) + '&title=' + encodeURIComponent(title) + '&save_to_db=true';
        
        Lampa.Player.play({
            title: title,
            url: url,
            timeline: [],
            movie: { id: 'r1_'+Date.now(), title: title, source: PLUGIN_NAME }
        });
        Lampa.Player.playlist([Lampa.Player.selected()]);
    }

    function stringToColor(str) {
        var hash = 0;
        for (var i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
        var c = (hash & 0x00FFFFFF).toString(16).toUpperCase();
        return '#' + "00000".substring(0, 6 - c.length) + c;
    }

    init();
})();
