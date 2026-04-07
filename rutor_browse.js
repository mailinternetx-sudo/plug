(function(){
    'use strict';

    console.log('[RUTOR v4] Autonomy Mode');

    const categories = [
        { name: '🔥 Топ за 24 часа', url: 'https://rutor.info/top' },
        { name: '🎬 Зарубежные фильмы', url: 'https://rutor.info/browse/1/0/0/0' },
        { name: '🎥 Наши фильмы', url: 'https://rutor.info/browse/5/0/0/0' },
        { name: '📺 Зарубежные сериалы', url: 'https://rutor.info/browse/4/0/0/0' },
        { name: '📺 Наши сериалы', url: 'https://rutor.info/browse/6/0/0/0' },
        { name: '📡 ТВ', url: 'https://rutor.info/browse/7/0/0/0' }
    ];

    function parseRutorHTML(html){
        // Простой парсер magnet
        const regex = /<a href="(magnet:[^"]+)"[^>]*>([^<]+)<\/a>/gi;
        let match;
        const movies = [];
        while(match = regex.exec(html)){
            movies.push({ title: match[2], torrents: [match[1]], poster: '' });
        }
        return movies;
    }

    function openTorrents(item){
        Lampa.Select.show({
            title: item.title,
            items: item.torrents.map((m,i)=>({title:'Раздача '+(i+1),url:m})),
            onSelect: (a)=>Lampa.Activity.push({component:'torrent',title:item.title,url:a.url,torrent:a.url})
        });
    }

    function Category(object){
        var scroll = new Lampa.Scroll({mask:true, over:true});
        var body = $('<div class="card-list"></div>');

        this.create = function(){
            this.activity.loader(true);

            fetch(object.url).then(r=>r.text()).then(html=>{
                const list = parseRutorHTML(html);

                list.forEach(item=>{
                    const card = $(`
                        <div class="card">
                            <div class="card__view" style="background-image:url('${item.poster || ''}')"></div>
                            <div class="card__title">${item.title}</div>
                            <div class="card__text">${item.torrents.length} раздач</div>
                        </div>
                    `);
                    card.on('hover:enter',()=>openTorrents(item));
                    body.append(card);
                });

                scroll.append(body);
                this.activity.loader(false);
            }).catch(e=>{
                this.activity.loader(false);
                Lampa.Noty.show('Ошибка загрузки rutor.info');
                console.error(e);
            });

            return scroll.render();
        }

        this.destroy = function(){ scroll.destroy(); }
    }

    function Main(){
        var scroll = new Lampa.Scroll({mask:true});
        var body = $('<div></div>');

        this.create = function(){
            const search = $('<div class="menu-item">🔍 Поиск</div>');
            search.on('hover:enter', ()=>{
                Lampa.Input.show({
                    title:'Поиск Rutor',
                    onSelect: (value)=>{
                        const url = `https://rutor.info/search/${encodeURIComponent(value)}/0/0/0`;
                        fetch(url).then(r=>r.text()).then(html=>{
                            const list = parseRutorHTML(html);
                            Lampa.Activity.push({component:'rutor_results',title:value,data:list});
                        }).catch(e=>Lampa.Noty.show('Ошибка поиска'));
                    }
                });
            });
            body.append(search);

            categories.forEach(cat=>{
                const el = $('<div class="menu-item"></div>');
                el.text(cat.name);
                el.on('hover:enter', ()=>Lampa.Activity.push({component:'rutor_cat',url:cat.url,title:cat.name}));
                body.append(el);
            });

            scroll.append(body);
            return scroll.render();
        }

        this.destroy = function(){ scroll.destroy(); }
    }

    function Results(object){
        var scroll = new Lampa.Scroll({mask:true, over:true});
        var body = $('<div class="card-list"></div>');

        this.create = function(){
            object.data.forEach(item=>{
                const card = $(`
                    <div class="card">
                        <div class="card__title">${item.title}</div>
                        <div class="card__text">${item.torrents.length} раздач</div>
                    </div>
                `);
                card.on('hover:enter',()=>openTorrents(item));
                body.append(card);
            });
            scroll.append(body);
            return scroll.render();
        }

        this.destroy = function(){ scroll.destroy(); }
    }

    function start(){
        Lampa.Component.add('rutor_main',Main);
        Lampa.Component.add('rutor_cat',Category);
        Lampa.Component.add('rutor_results',Results);

        Lampa.Template.add('rutor_icon',`
            <svg viewBox="0 0 24 24">
                <path fill="currentColor" d="M12 2L2 7v7c0 5 3.8 9.7 10 12c6.2-2.3 10-7 10-12V7z"/>
            </svg>
        `);

        Lampa.Menu.add({title:'Rutor Local', icon:Lampa.Template.get('rutor_icon'), component:'rutor_main'});

        console.log('[RUTOR v4] Ready and IP-free');
    }

    if(window.Lampa) start();
    else window.addEventListener('lampa',start);

})();
