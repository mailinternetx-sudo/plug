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

        // 🔥 фикс таймаута (важно для WebOS)
        network.timeout(15000);

        // =======================
        // 📺 КАТЕГОРИИ (FIXED)
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
                            poster_path: item.poster_path,
                            backdrop_path: item.poster_path,
                            vote_average: item.vote_average || 0,
                            type: item.type || 'movie',
                            source: 'tmdb',

                            // доп. мета (стабильность UI)
                            card_class: 'media--poster'
                        };
                    });

                    results_all.push({
                        title: sheet,
                        results: results,
                        page: 1,
                        total_pages: 1
                    });

                    loaded++;

                    if (loaded === SHEETS.length) {
                        onSuccess(results_all);
                    }

                }, function () {

                    // если ошибка — не ломаем всё
                    results_all.push({
                        title: sheet,
                        results: [],
                        page: 1,
                        total_pages: 1
                    });

                    loaded++;

                    if (loaded === SHEETS.length) {
                        onSuccess(results_all);
                    }

                });

            });
        };

        // =======================
        // 🎬 FULL (ULTIMATE)
        // =======================
        this.full = function (params, onSuccess, onError) {

            // 1️⃣ TMDB карточка
            Lampa.Api.sources.tmdb.full(params, function (data) {

                data.sources = data.sources || [];

                // =======================
                // 🎥 ВСЕ ИСТОЧНИКИ
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
                // 📺 СЕРИАЛЫ
                // =======================
                if (params.type === 'tv') {
                    data.serial = true;
                }

                // =======================
                // 🧹 ЧИСТКА
                // =======================
                data.sources = data.sources.filter(Boolean);

                onSuccess(data);

            }, function () {

                // fallback (если TMDB упал)
                onError();
            });
        };
    }

    // =======================
    // 🚀 СТАРТ
    // =======================
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
