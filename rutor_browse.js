// ========== УЛУЧШЕННЫЙ ПАРСИНГ ==========
function parseRutorPage(html, categoryName) {
    const items = [];
    try {
        // Правильно парсим HTML-строку в DOM
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        log(`🔍 Начинаю парсинг для категории: "${categoryName}"`);

        // Ищем все таблицы
        const tables = doc.querySelectorAll('table');
        log(`📊 Найдено таблиц: ${tables.length}`);

        if (tables.length === 0) {
            errorLog('❌ Таблицы не найдены на странице');
            return items;
        }

        for (let tableIdx = 0; tableIdx < tables.length; tableIdx++) {
            const table = tables[tableIdx];
            const rows = table.querySelectorAll('tbody tr, tr');
            
            log(`📍 Таблица ${tableIdx}: ${rows.length} строк`);

            for (const row of rows) {
                try {
                    const cells = row.querySelectorAll('td');
                    if (cells.length < 4) continue;

                    // Ищем magnet-ссылку
                    const magnetEl = row.querySelector('a[href^="magnet:"]');
                    if (!magnetEl) continue;
                    
                    const magnet = magnetEl.getAttribute('href');
                    if (!magnet || magnet.length < 20) continue;

                    // Ищем название торрента (ссылка на /torrent/)
                    let titleEl = row.querySelector('a[href*="/torrent/"]');
                    
                    // Fallback: берем вторую ссылку в строке
                    if (!titleEl) {
                        const links = row.querySelectorAll('a');
                        if (links.length > 1) titleEl = links[1];
                    }

                    if (!titleEl) continue;
                    
                    let title = titleEl.textContent.trim().replace(/\s+/g, ' ');
                    if (!title || title.length < 2) continue;

                    log(`✓ Найден торрент: "${title.substring(0, 50)}..."`);

                    // Извлекаем данные из ячеек (расположение может варьироваться)
                    let date = '';
                    let size = 'N/A';
                    let seeds = '0';
                    let leech = '0';

                    // Проходим по всем ячейкам
                    for (let i = 0; i < cells.length; i++) {
                        const cellText = cells[i].textContent.trim();
                        
                        // Дата обычно в первой ячейке (формат: DD.MM или DD.MM.YY)
                        if (i === 0 && /^\d{1,2}\.\d{1,2}/.test(cellText)) {
                            date = cellText;
                        }
                        
                        // Размер (содержит цифры и B, KB, MB, GB, TB)
                        if (/\d+(\.\d+)?\s*[KMGT]?B/i.test(cellText) && size === 'N/A') {
                            size = cellText;
                        }
                        
                        // Сиды и личи (только цифры, обычно в конце таблицы)
                        if (/^\d+$/.test(cellText)) {
                            // Пытаемся определить, это сиды или личи по позиции
                            if (seeds === '0') {
                                seeds = cellText;
                            } else if (leech === '0' && cellText !== seeds) {
                                leech = cellText;
                                break; // Обычно личи - последнее число
                            }
                        }
                    }

                    items.push({
                        title,
                        magnet,
                        size: size || 'N/A',
                        seeds: seeds || '0',
                        leech: leech || '0',
                        date: date || 'N/A',
                        category: categoryName
                    });

                } catch (rowErr) {
                    // Пропускаем проблемные строки
                    continue;
                }
            }

            if (items.length > 0) {
                log(`✅ Найдено ${items.length} торрентов в таблице ${tableIdx}`);
                break; // Выходим, если нашли данные в этой таблице
            }
        }

        if (items.length === 0) {
            errorLog(`⚠️ Торренты не найдены для категории "${categoryName}"`);
            // Для отладки выводим структуру страницы
            log('Первые 500 символов HTML:', html.substring(0, 500));
        } else {
            log(`✅ Успешно распаршено ${items.length} торрентов`);
        }
        
    } catch (e) {
        errorLog('❌ Критическая ошибка парсинга:', e);
        console.error(e.stack);
    }

    return items;
}

// ========== ЗАГРУЗКА СТРАНИЦЫ ==========
async function loadRutorPage(categoryKey) {
    const cat = CATEGORIES[categoryKey];
    if (!cat) {
        errorLog('❌ Неизвестная категория:', categoryKey);
        return [];
    }

    const url = `https://rutor.info${cat.url}`;
    const proxiedUrl = getProxiedUrl(url);
    log(`📥 Загрузка: ${url}`);
    log(`🔗 Прокси URL: ${proxiedUrl}`);

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        const response = await fetch(proxiedUrl, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.8',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache'
            }
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status} ${response.statusText}`);
        }

        // ВАЖНО: Проверяем что ответ - это HTML
        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
            log(`⚠️ Неожиданный тип контента: ${contentType}`);
        }

        // Получаем HTML как СТРОКУ
        let html = await response.text();
        
        if (!html || html.length < 500) {
            throw new Error(`Получен слишком короткий ответ (${html ? html.length : 0} символов)`);
        }

        log(`✅ Получено ${html.length} символов HTML`);
        
        // Проверяем, не ошибка ли это
        if (html.includes('403') || html.includes('Forbidden')) {
            throw new Error('Доступ запрещен (403). Прокси не работает?');
        }
        
        if (html.includes('404') || html.includes('Not Found')) {
            throw new Error('Страница не найдена (404)');
        }

        // Теперь парсим HTML-строку
        return parseRutorPage(html, cat.name);

    } catch (e) {
        errorLog('❌ Ошибка загрузки:', e.message);
        
        let errorMsg = '❌ Ошибка загрузки!';
        if (e.name === 'AbortError') {
            errorMsg = '⏱️ Таймаут! Проверьте TorrServer и интернет';
        } else if (e.message.includes('403')) {
            errorMsg = '🔒 Доступ запрещен. Включите прокси в настройках!';
        } else if (e.message.includes('404')) {
            errorMsg = '🚫 Категория не найдена';
        } else if (!settings.useProxy) {
            errorMsg = '🔌 Включите прокси TorrServer в настройках!';
        }
        
        Lampa.Notification.show(errorMsg, 5000);
        return [];
    }
}
