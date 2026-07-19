// Holt aktuelle Lokalnachrichten aus Schweinfurt & Umgebung (RSS von inFranken.de,
// offiziell zur freien Syndizierung bereitgestellt: https://www.infranken.de/rss/)
// Liefert Titel, Anrisstext, Bild, Link und Quellenangabe - keine vollen Artikeltexte.

const FEED_URL = 'https://www.infranken.de/storage/rss/rss/2.0/schweinfurt.xml';
const SOURCE_NAME = 'inFranken.de';
const CACHE_MS = 30 * 60 * 1000; // 30 Minuten Cache
let cache = { at: 0, items: [] };

function decodeEntities(str) {
  return String(str || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim();
}

function extractTag(block, tag) {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  if (!m) return '';
  return decodeEntities(m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/, '$1'));
}

function extractEnclosure(block) {
  const m = block.match(/<enclosure[^>]*url="([^"]+)"[^>]*>/i);
  return m ? m[1] : null;
}

function parseFeed(xml) {
  const items = [];
  const itemBlocks = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
  for (const block of itemBlocks) {
    const title = extractTag(block, 'title');
    const link = extractTag(block, 'link');
    const description = extractTag(block, 'description');
    const pubDate = extractTag(block, 'pubDate');
    const image = extractEnclosure(block);
    if (!title || !link) continue;
    items.push({ title, link, excerpt: description, image, pubDate, source: SOURCE_NAME });
  }
  return items;
}

module.exports = async (req, res) => {
  try {
    const now = Date.now();
    if (now - cache.at < CACHE_MS && cache.items.length) {
      res.setHeader('Cache-Control', 'public, max-age=600');
      return res.status(200).json({ ok: true, items: cache.items, cached: true });
    }

    const r = await fetch(FEED_URL, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; KeksstrasseNewsBot/1.0)' } });
    if (!r.ok) throw new Error(`Feed-Abruf fehlgeschlagen: ${r.status}`);
    const buf = Buffer.from(await r.arrayBuffer());
    const xml = buf.toString('latin1'); // Feed ist ISO-8859-1 kodiert

    const items = parseFeed(xml).slice(0, 8);
    cache = { at: now, items };

    res.setHeader('Cache-Control', 'public, max-age=600');
    res.status(200).json({ ok: true, items });
  } catch (err) {
    console.error('news-schweinfurt Fehler:', err);
    if (cache.items.length) {
      return res.status(200).json({ ok: true, items: cache.items, stale: true });
    }
    res.status(500).json({ ok: false, error: 'Nachrichten konnten nicht geladen werden.' });
  }
};
