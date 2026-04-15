(function () {
    'use strict';

    var SOURCE_NAME = 'ULTIMATE HYBRID';
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

        // =======================
        // 📺 КАТЕГОРИИ
        // =======================
        this.category = function (params, onSuccess) {

            var parts = [];

            SHEETS.forEach(function (sheet) {

                parts.push(function (next) {

                    network.silent(API_URL + '?sheet=' + sheet, function (json) {

                        var results = (json.results || []).map(function (item) {

                            return {
                                id: item.id, // ✅ TMDB ID
                                title: item.title,
                                name: item.title,
                                poster_path: item.poster_path,
                                backdrop_path: item.poster_path,
                                vote_average: item.vote_average || 0,
                                type: item.type || 'movie',
                                source: 'tmdb',

                                // 💥 ULTIMATE META
                                card_class: 'media--poster',
                                genres: [],
                                overview: ''
                            };
                        });

                        next({
                            title: sheet,
                            results: results,
                            page: 1,
                            total_pages: 1
                        });

                    }, function () {
                        next({ title: sheet, results: [] });
                    });

                });

            });

            Lampa.Api.partNext(parts, 3, onSuccess);
        };

        // =======================
        // 🎬 FULL (ГЛАВНАЯ МАГИЯ)
        // =======================
        this.full = function (params, onSuccess, onError) {

            // 1️⃣ получаем TMDB
            Lampa.Api.sources.tmdb.full(params, function (data) {

                data.sources = data.sources || [];

                // =======================
                // 🎥 ДОБАВЛЯЕМ ВСЕ ИСТОЧНИКИ
                // =======================

                // Filmix
                data.sources.push({
                    title: 'Filmix',
                    url: 'filmix',
                    quality: 'auto'
                });

                // Rezka
                data.sources.push({
                    title: 'Rezka',
                    url: 'rezka',
                    quality: 'auto'
                });

                // Torrents / TorrServe
                data.sources.push({
                    title: 'Torrents',
                    url: 'torrent',
                    quality: 'auto'
                });

                // =======================
                // 📺 ДЛЯ СЕРИАЛОВ
                // =======================
                if (params.type === 'tv') {
                    data.serial = true;
                }

                // =======================
                // ⭐ АВТОВЫБОР ЛУЧШЕГО
                // =======================
                data.sources = data.sources.filter(Boolean);

                onSuccess(data);

            }, function () {

                // =======================
                // 🔄 FALLBACK ЕСЛИ TMDB УПАЛ
                // =======================
                onError();
            });
        };
    }

    function start() {
        if (window.ultimate_ready) return;
        window.ultimate_ready = true;

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
