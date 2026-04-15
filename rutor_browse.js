(function () {
    'use strict';

    var SOURCE_NAME = 'AI FILMIX MAX';
    var API_URL = 'https://script.google.com/macros/s/AKfycbz_5VESAAFFcrD8BB8DJnj1Q-NBdLFLUbphP5SRb07KQ3RHZT_zoeBj8MYZVdEneHC-/exec';

    var SHEETS = [
        'Топ 24ч',
        'Зарубежные фильмы',
        'Наши фильмы',
        'Зарубежные сериалы',
        'Наши сериалы',
        'Телевизор'
    ];

    function Api() {
        var network = new Lampa.Reguest();
        network.timeout(15000);

        // =======================
        // 🧠 CLEAN TITLE
        // =======================
        function cleanTitle(text) {
            return (text || '')
                .toLowerCase()
                .replace(/\[.*?\]/g, '')
                .replace(/\(.*?\)/g, '')
                .replace(/hd|1080p|720p|webrip|hdrip|camrip/gi, '')
                .replace(/[^a-zа-я0-9\s]/gi, '')
                .trim();
        }

        // =======================
        // 🧠 ВАРИАНТЫ НАЗВАНИЙ
        // =======================
        function makeTitles(title) {
            var base = cleanTitle(title);
            var list = [];

            list.push(base);
            list.push(base.split(' ').reverse().join(' '));

            var parts = base.split(' ');
            for (var i = 0; i < parts.length; i++) {
                list.push(parts.filter((_, j) => j !== i).join(' '));
            }

            return list.filter(function (v, i, a) {
                return v && a.indexOf(v) === i;
            });
        }

        // =======================
        // 📺 CATEGORY
        // =======================
        this.category = function (params, onSuccess) {

            var results_all = [];
            var loaded = 0;

            SHEETS.forEach(function (sheet) {

                network.silent(API_URL + '?sheet=' + sheet, function (json) {

                    var results = (json.results || []).map(function (item) {
                        return {
                            id: item.id,
                            title: item.title,
                            name: item.title,
                            original_title: item.title,
                            poster_path: item.poster_path,
                            backdrop_path: item.poster_path,
                            vote_average: item.vote_average || 0,
                            type: item.type || 'movie',
                            source: 'tmdb',

                            // 💥 передаём оригинал для источников
                            filmix_title: item.title
                        };
                    });

                    results_all.push({
                        title: sheet,
                        results: results,
                        page: 1,
                        total_pages: 1
                    });

                    loaded++;
                    if (loaded === SHEETS.length) onSuccess(results_all);

                }, function () {

                    results_all.push({
                        title: sheet,
                        results: [],
                        page: 1,
                        total_pages: 1
                    });

                    loaded++;
                    if (loaded === SHEETS.length) onSuccess(results_all);
                });

            });
        };

        // =======================
        // 🎬 FULL (FILMIX PRIORITY)
        // =======================
        this.full = function (params, onSuccess, onError) {

            var titles = makeTitles(params.filmix_title || params.title || params.name);

            function loadTMDB(done) {
                Lampa.Api.sources.tmdb.full(params, function (data) {
                    done(data);
                }, function () {
                    done(null);
                });
            }

            loadTMDB(function (data) {

                if (!data) {
                    onError();
                    return;
                }

                data.sources = [];

                // =======================
                // 🎯 FILMIX ПРИОРИТЕТ
                // =======================
                data.sources.push({
                    title: 'Filmix',
                    url: 'filmix',
                    search: titles[0], // 💥 передаём название
                    quality: 'auto'
                });

                // fallback 1
                data.sources.push({
                    title: 'Rezka',
                    url: 'rezka',
                    search: titles[0],
                    quality: 'auto'
                });

                // fallback 2
                data.sources.push({
                    title: 'Torrents',
                    url: 'torrent',
                    search: titles[0],
                    quality: 'auto'
                });

                // =======================
                // 📺 СЕРИАЛЫ
                // =======================
                if (params.type === 'tv') {
                    data.serial = true;
                }

                // =======================
                // 🚀 АВТОВЫБОР ИСТОЧНИКА
                // =======================
                data.controller = {
                    play: true,           // автозапуск
                    autoplay: true,
                    quality: 'high',      // лучшее качество
                    source: 'filmix'      // 💥 приоритет
                };

                onSuccess(data);
            });
        };
    }

    // =======================
    // 🚀 START
    // =======================
    function start() {
        if (window.ai_filmix_ready) return;
        window.ai_filmix_ready = true;

        var api = new Api();
        Lampa.Api.sources[SOURCE_NAME] = api;

        $('.menu .menu__list').eq(0).append(
            $('<li class="menu__item selector"><div class="menu__text">' + SOURCE_NAME + '</div></li>')
            .on('hover:enter', function () {
                Lampa.Activity.push({
                    component: 'category',
                    source: SOURCE_NAME
                });
            })
        );
    }

    if (window.appready) start();
    else {
        Lampa.Listener.follow('app', function (e) {
            if (e.type === 'ready') start();
        });
    }

})();
