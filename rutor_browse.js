(function() {
    'use strict';

    // === НАСТРОЙКИ ===
    var PLUGIN_NAME = 'RUTOR1';
    var STORAGE_KEY = 'rutor_cache_v3';
    var CACHE_LIFETIME = 60 * 60 * 1000; // Кеш на 1 час

    // Стили UI
    var STYLES = `
        .rutor-custom-card { display: flex; padding: 15px; border-bottom: 1px solid rgba(255,255,255,0.1); cursor: pointer; align-items: center; }
        .rutor-custom-card:hover { background-color: rgba(255, 255, 255, 0.1); }
        .rutor-poster-placeholder { width: 80px; height: 110px; background-color: #333; display: flex; align-items: center; justify-content: center; color: #777; font-size: 10px; margin-right: 20px; flex-shrink: 0; background-size: cover; background-position: center; }
        .rutor-info { flex-grow: 1; }
        .rutor-title { font-size: 16px; font-weight: bold; color: #fff; margin-bottom: 5px; }
        .rutor-meta { font-size: 13px; color: #aaa; }
        .rutor-loader { text-align: center; padding: 50px; color: #fff; }
        .rutor-error { color: #ff4700; text-align: center; padding: 20px; }
    `;

    // Иконка
    var MENU_ICON_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>';

    // === ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ===

    // XHR с поддержкой прокси TorrServer
    function makeRequest(method, targetUrl) {
        return new Promise(function(resolve, reject) {
            var xhr = new XMLHttpRequest();
            
            // --- ЛОГИКА ПРОКСИ ---
            // Получаем адрес TorrServer из настроек Lampa
            var tsUrl = Lampa.Storage.get('torrserver_url');
            
            if (!tsUrl) {
                reject({ status: 0, statusText: 'TorrServer not configured in Lampa settings' });
                return;
            }

            // Нормализуем TS URL (убираем слеш в конце)
            tsUrl = tsUrl.replace(/\/$/, '');

            // Формируем прокси-запрос.
            // Стандарт TorrServer: http://IP:PORT/proxy/http://site.com/path
            var proxyUrl = tsUrl + '/proxy/' + targetUrl.replace('://', '/');

            console.log('RUTOR Proxy Request:', proxyUrl);
            
            xhr.open(method, proxyUrl, true);
            xhr.onload = function() {
                if (xhr.status >= 200 && xhr.status < 300) {
                    resolve(xhr.responseText);
                } else {
                    console.error('Proxy Error Status:', xhr.status);
                    reject({ status: xhr.status, statusText: xhr.statusText });
                }
            };
            xhr.onerror = function() { 
                console.error('Proxy Network Error');
                reject({ status: 0, statusText: 'Network Error (Check TorrServer)' }); 
            };
            xhr.send();
        });
    }

    // LocalStorage обертка
    var Storage = {
        get: function(key) { try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; } },
        set: function(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {} }
    };

    // Инициализация
    function init() {
        if (typeof Lampa === 'undefined') {
            console.error('RUTOR: Lampa not found');
            return;
        }

        // Внедряем стили
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
                bind.render().innerHTML = '<div class="rutor-loader">Загрузка через TorrServer...</div>';
                var cached = Storage.get(STORAGE_KEY + '_' + catItem.id);
                if (cached && Date.now() - cached.time < CACHE_LIFETIME) {
                    renderResults(cached.data, bind);
                } else {
                    loadAndParse(catItem.url, bind, catItem.id);
                }
            }
        });
    }

    // Загрузка
    function loadAndParse(path, bind, catId) {
        // Формируем полный целевой URL для прокси
        var targetUrl = 'http://rutor.info' + path;
        
        makeRequest('GET', targetUrl).then(function(html) {
            var movies = parseRutorHtml(html);
            
            if (movies.length > 0) {
                Storage.set(STORAGE_KEY + '_' + catId, { data: movies, time: Date.now() });
                renderResults(movies, bind);
            } else {
                // Проверка на пустой результат
                var parser = new DOMParser();
                var doc = parser.parseFromString(html, 'text/html');
                var bodyText = doc.body ? doc.body.innerText.toLowerCase() : '';
                
                if (bodyText.indexOf('ничего не найдено') > -1 || bodyText.indexOf('nothing found') > -1) {
                    bind.render().innerHTML = '<div class="rutor-error">По запросу ничего не найдено.</div>';
                } else {
                    console.warn('RUTOR Parser: Empty result. HTML length:', html.length);
                    bind.render().innerHTML = '<div class="rutor-error">Список пуст. Возможно, изменилась верстка.</div>';
                }
            }
        }).catch(function(e) {
            console.error('RUTOR Request Error:', e);
            if (e.statusText.indexOf('TorrServer not configured') !== -1) {
                bind.render().innerHTML = '<div class="rutor-error">Ошибка: Не настроен TorrServer в настройках Lampa!</div>';
            } else {
                bind.render().innerHTML = '<div class="rutor-error">Ошибка загрузки. Проверьте TorrServer.</div>';
            }
        });
    }

    // Парсер
    function parseRutorHtml(html) {
        var parser = new DOMParser();
        var doc = parser.parseFromString(html, 'text/html');
        var res = [];
        
        var table = doc.getElementById('index');
        if (!table) return [];

        var rows = table.querySelectorAll('tr');
        
        rows.forEach(function(tr) {
            if (tr.querySelector('th')) return;
            var tds = tr.querySelectorAll('td');
            if (tds.length < 4) return;

            var linkTag = null;
            var sizeTag = null;
            var seedsTag = null;

            // Умный поиск ячеек
            for (var i = 0; i < tds.length; i++) {
                var a = tds[i].querySelector('a');
                if (a && a.href.indexOf('/torrent/') !== -1) {
                    linkTag = a;
                    if (tds[i+1]) sizeTag = tds[i+1].querySelector('span');
                    if (tds[tds.length-1]) seedsTag = tds[tds.length-1];
                    break;
                }
            }
            
            if (!linkTag && tds[1]) {
                linkTag = tds[1].querySelector('a');
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
        Lampa.Modal.open({ title: m.title, html: '<div style="padding:20px;">Получение Magnet...</div>', onBack: function(){Lampa.Modal.close();return false;} });
        
        // Загружаем детали тоже через прокси
        makeRequest('GET', m.url).then(function(html) {
            var doc = new DOMParser().parseFromString(html, 'text/html');
            var mag = doc.querySelector('a[href^="magnet:"]');
            if (mag) {
                startStream(mag.getAttribute('href'), m.title);
            } else {
                Lampa.Modal.close(); Lampa.Noty.show('Magnet не найден');
            }
        }).catch(function(){ Lampa.Modal.close(); Lampa.Noty.show('Ошибка загрузки деталей'); });
    }

    function startStream(magnet, title) {
        Lampa.Modal.close();
        var ts = Lampa.Storage.get('torrserver_url');
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
