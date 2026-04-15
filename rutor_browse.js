(function () {
    'use strict';

    var SOURCE_NAME = 'AI PRO MAX';
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
        // 🧠 ОЧИСТКА СТРОКИ
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
        // 🔢 LEVENSHTEIN
        // =======================
        function similarity(a, b) {
            if (!a || !b) return 0;

            var longer = a.length > b.length ? a : b;
            var shorter = a.length > b.length ? b : a;

            var same = 0;

            for (var i = 0; i < shorter.length; i++) {
                if (longer[i] === shorter[i]) same++;
            }

            return same / longer.length;
        }

        // =======================
        // 🧠 ВАРИАНТЫ
        // =======================
        function makeTitles(title) {

            var base = cleanTitle(title);
            var list = [];

            list.push(base);

            // reverse
            list.push(base.split(' ').reverse().join(' '));

            // remove words one by one
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
                            poster_path: item.poster_path,
                            backdrop_path: item.poster_path,
                            vote_average: item.vote_average || 0,
                            type: item.type || 'movie',
                            source: 'tmdb'
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
        // 🎬 FULL (AI MATCH)
        // =======================
        this.full = function (params, onSuccess, onError) {

            var original = cleanTitle(params.title || params.name);
            var titles = makeTitles(params.title || params.name);

            var bestData = null;
            var bestScore = 0;

            function tryNext(i) {

                if (i >= titles.length) {

                    if (bestData) {
                        onSuccess(bestData);
                    } else {
                        onError();
                    }

                    return;
                }

                var newParams = Object.assign({}, params, {
                    title: titles[i],
                    name: titles[i]
                });

                Lampa.Api.sources.tmdb.full(newParams, function (data) {

                    var found = cleanTitle(data.title || data.name);
                    var score = similarity(original, found);

                    if (score > bestScore) {
                        bestScore = score;
                        bestData = data;
                    }

                    tryNext(i + 1);

                }, function () {
                    tryNext(i + 1);
                });
            }

            tryNext(0);

            // финализация
            setTimeout(function () {

                if (bestData) {

                    bestData.sources = bestData.sources || [];

                    bestData.sources.push({ title: 'Filmix', url: 'filmix' });
                    bestData.sources.push({ title: 'Rezka', url: 'rezka' });
                    bestData.sources.push({ title: 'Torrents', url: 'torrent' });

                    if (params.type === 'tv') bestData.serial = true;

                    onSuccess(bestData);

                } else {
                    onError();
                }

            }, 2000);
        };
    }

    function start() {
        if (window.ai_pro_max_ready) return;
        window.ai_pro_max_ready = true;

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
