(function () {
    'use strict';

    var SOURCE_NAME = 'ULTIMATE FILMIX AI';
    var API_URL = 'https://script.google.com/macros/s/AKfycbyfaTd43bLjpj0fgICwORZb1o-ibPhZqNN7Xpc87Hy1YDmHIlh0-Xq5tNwmnnmkwmLF/exec';

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
                            poster_path: item.poster_path,
                            backdrop_path: item.poster_path,
                            vote_average: item.vote_average || 0,
                            type: item.type || 'movie',
                            source: 'tmdb',

                            // 💥 из колонки B
                            filmix_title: item.original_title_sheet || item.title
                        };
                    });

                    results_all.push({
                        title: sheet,
                        results: results
                    });

                    loaded++;
                    if (loaded === SHEETS.length) onSuccess(results_all);

                }, function () {

                    results_all.push({ title: sheet, results: [] });

                    loaded++;
                    if (loaded === SHEETS.length) onSuccess(results_all);
                });

            });
        };

        // =======================
        // 🎬 FULL (FILMIX SEARCH)
        // =======================
        this.full = function (params, onSuccess, onError) {

            var title = params.filmix_title || params.title;

            // 🔍 поиск как в Lampa
            Lampa.Api.sources.filmix.search({
                query: title
            }, function (json) {

                if (json && json.results && json.results.length) {

                    var item = json.results[0];

                    Lampa.Api.sources.filmix.full(item, function (data) {
                        onSuccess(data);
                    }, fallback);

                } else fallback();

            }, fallback);

            function fallback() {

                Lampa.Api.sources.tmdb.full(params, function (data) {

                    data.sources = [];

                    data.sources.push({ title: 'Filmix', url: 'filmix' });
                    data.sources.push({ title: 'Rezka', url: 'rezka' });
                    data.sources.push({ title: 'Torrents', url: 'torrent' });

                    onSuccess(data);

                }, onError);
            }
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
