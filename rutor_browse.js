(function () {
    'use strict';

    console.log('[RUTOR V3] start');

    var CACHE_TIME = 1000 * 60 * 30;

    var TMDB_IMG = 'https://image.tmdb.org/t/p/w500';

    var categories = [
        { name: '🔥 Топ за 24 часа', url: 'https://rutor.info/top' },
        { name: '🎬 Зарубежные фильмы', url: 'https://rutor.info/browse/1/0/0/0' },
        { name: '🎥 Наши фильмы', url: 'https://rutor.info/browse/5/0/0/0' },
        { name: '📺 Зарубежные сериалы', url: 'https://rutor.info/browse/4/0/0/0' },
        { name: '📺 Наши сериалы', url: 'https://rutor.info/browse/6/0/0/0' },
        { name: '📡 ТВ', url: 'https://rutor.info/browse/7/0/0/0' }
    ];

    function parseHTML(html) {
        return new DOMParser().parseFromString(html, 'text/html');
    }

    function normalizeTitle(title) {
        return title
            .replace(/\[.*?\]/g, '')
            .replace(/\(.*?\)/g, '')
            .replace(/(720p|1080p|2160p|4K|HDR|BluRay|WEBRip|WEB-DL|x264|x265)/gi, '')
            .trim();
    }

    function extractMagnet(m) {
        var hash = (m.match(/btih:([a-zA-Z0-9]+)/) || [])[1];
        return { magnet: m, hash: hash };
    }

    function getCache(key) {
        var d = Lampa.Storage.get(key, null);
        if (!d) return null;
        if (Date.now() - d.time > CACHE_TIME) return null;
        return d.value;
    }

    function setCache(key, value) {
        Lampa.Storage.set(key, { time: Date.now(), value: value });
    }

    function loadRutor(url, callback) {
        var cacheKey = 'rutor_' + url;
        var cache = getCache(cacheKey);

        if (cache) return callback(cache);

        fetch(url)
            .then(r => r.text())
            .then(html => {
                var doc = parseHTML(html);
                var rows = doc.querySelectorAll('tr.gai, tr.tum');

                var list = [];

                rows.forEach(row => {
                    var m = row.querySelector('a[href^="magnet:"]');
                    var t = row.querySelector('a[href^="/torrent/"]');
                    var s = row.querySelectorAll('td')[3];

                    if (!m || !t) return;

                    var data = extractMagnet(m.href);

                    list.push({
                        title: t.textContent.trim(),
                        clean: normalizeTitle(t.textContent),
                        size: s ? s.textContent.trim() : '',
                        magnet: data.magnet
                    });
                });

                setCache(cacheKey, list);
                callback(list);
            })
            .catch(() => callback([]));
    }

    // 🔥 TMDB POSTER
    function loadPoster(title, callback) {
        var cacheKey = 'poster_' + title;
        var cache = getCache(cacheKey);

        if (cache) return callback(cache);

        fetch('https://api.tvmaze.com/search/shows?q=' + encodeURIComponent(title))
            .then(r => r.json())
            .then(json => {
                var item = json[0];

                var result = {
                    poster: item?.show?.image?.medium || '',
                    backdrop: item?.show?.image?.original || ''
                };

                setCache(cacheKey, result);
                callback(result);
            })
            .catch(() => callback({}));
    }

    // 🧠 GROUP
    function group(items) {
        var map = {};

        items.forEach(item => {
            if (!map[item.clean]) {
                map[item.clean] = {
                    title: item.clean,
                    list: []
                };
            }

            map[item.clean].list.push(item);
        });

        return Object.values(map);
    }

    function openTorrents(group) {
        var items = group.list.map((it, i) => {
            return {
                title: it.title,
                url: it.magnet,
                torrent: it.magnet
            };
        });

        Lampa.Select.show({
            title: group.title,
            items: items,
            onSelect: function (a) {
                Lampa.Activity.push({
                    component: 'torrent',
                    title: a.title,
                    url: a.url,
                    torrent: a.url
                });
            }
        });
    }

    function Category(object) {
        var scroll = new Lampa.Scroll({ mask: true, over: true });
        var body = $('<div class="card-list"></div>');

        this.create = function () {
            this.activity.loader(true);

            loadRutor(object.url, (items) => {
                var groups = group(items);

                groups.forEach(g => {
                    loadPoster(g.title, (img) => {

                        var card = $(`
                            <div class="card">
                                <div class="card__view"
                                    style="background-image:url('${img.poster || ''}')">
                                </div>
                                <div class="card__title">${g.title}</div>
                                <div class="card__text">${g.list.length} раздач</div>
                            </div>
                        `);

                        card.on('hover:enter', () => openTorrents(g));

                        body.append(card);
                    });
                });

                scroll.append(body);
                this.activity.loader(false);

            });

            return scroll.render();
        };

        this.destroy = function () {
            scroll.destroy();
        };
    }

    function Main() {
        var scroll = new Lampa.Scroll({ mask: true, over: true });
        var body = $('<div></div>');

        this.create = function () {

            var search = $('<div class="menu-item">🔍 Поиск</div>');

            search.on('hover:enter', () => {
                Lampa.Input.show({
                    title: 'Поиск',
                    onSelect: (v) => {
                        Lampa.Activity.push({
                            component: 'rutor_cat',
                            url: 'https://rutor.info/search/' + v,
                            title: v
                        });
                    }
                });
            });

            body.append(search);

            categories.forEach(cat => {
                var el = $('<div class="menu-item"></div>');
                el.text(cat.name);

                el.on('hover:enter', () => {
                    Lampa.Activity.push({
                        component: 'rutor_cat',
                        url: cat.url,
                        title: cat.name
                    });
                });

                body.append(el);
            });

            scroll.append(body);
            return scroll.render();
        };

        this.destroy = function () {
            scroll.destroy();
        };
    }

    function start() {
        Lampa.Component.add('rutor_main', Main);
        Lampa.Component.add('rutor_cat', Category);

        Lampa.Template.add('rutor_icon', `
            <svg viewBox="0 0 24 24">
                <path fill="currentColor"
                d="M12 2L2 7v7c0 5 3.8 9.7 10 12c6.2-2.3 10-7 10-12V7z"/>
            </svg>
        `);

        Lampa.Menu.add({
            title: 'Rutor V3',
            icon: Lampa.Template.get('rutor_icon'),
            component: 'rutor_main'
        });

        console.log('[RUTOR V3] ready');
    }

    if (window.Lampa) start();
    else window.addEventListener('lampa', start);

})();