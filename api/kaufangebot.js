const { sanitize, isRateLimited, isGibberish, hashIp, getSupabase, sendEmail, NOTIFY_TO, SEND_FROM } = require('../lib/shared');
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || 'unknown';
  if (isRateLimited(ip)) return res.status(429).json({ error: 'Zu viele Anfragen.' });
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  if (!body || typeof body !== 'object') return res.status(400).json({ error: 'Ungültige Anfrage.' });
  if (body['_hp'] && body['_hp'].trim() !== '') return res.status(200).json({ ok: true });
  const elapsed = parseInt(body['_elapsed'], 10);
  if (!isNaN(elapsed) && elapsed < 3) return res.status(200).json({ ok: true });
  const name = sanitize(body.name || '');
  const email = sanitize((body.email || '').toLowerCase());
  const adresse = sanitize(body.adresse || '');
  const kaufangebot_eur = parseFloat(body.kaufangebot_eur);
  const finanzierung_art = sanitize(body.finanzierung_art || '');
  const eigenkapital_eur = sanitize(body.eigenkapital_eur || '');
  const bindefrist_wert = parseInt(body.bindefrist_wert, 10);
  const bindefrist_einheit = sanitize(body.bindefrist_einheit || '');
  const nachricht = sanitize(body.nachricht || '');
  if (isGibberish(nachricht) || isGibberish(name)) return res.status(200).json({ ok: true });
  if (!name || !email) return res.status(400).json({ error: 'Name und E-Mail sind Pflichtfelder.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Ungültige E-Mail-Adresse.' });
  if (!kaufangebot_eur || kaufangebot_eur <= 0 || kaufangebot_eur > 100000000) return res.status(400).json({ error: 'Bitte geben Sie ein gültiges Kaufangebot an.' });
  if (!['liquide', 'finanzierung'].includes(finanzierung_art)) return res.status(400).json({ error: 'Bitte geben Sie an, ob liquide Mittel vorhanden sind oder eine Finanzierung nötig ist.' });
  if (!bindefrist_wert || bindefrist_wert <= 0 || !['Tage', 'Wochen', 'Monate'].includes(bindefrist_einheit)) return res.status(400).json({ error: 'Bitte geben Sie an, wie lange Sie sich an das Angebot halten.' });
  const supabase = getSupabase();
  const { error: dbError } = await supabase.from('keks_kaufangebote').insert({
    name, email, adresse, kaufangebot_eur, finanzierung_art, eigenkapital_eur,
    bindefrist_wert, bindefrist_einheit, nachricht, ip_hash: hashIp(ip)
  });
  if (dbError) { console.error('Supabase insert error:', dbError); return res.status(500).json({ error: 'Speicherfehler.' }); }
  const ts = new Date().toLocaleString('de-DE');
  const betragFormatted = kaufangebot_eur.toLocaleString('de-DE');
  const finLabel = finanzierung_art === 'liquide' ? 'Liquide Mittel vorhanden' : 'Bankenfinanzierung erforderlich';
  const html = `<h2>Neues Kaufangebot: ${betragFormatted} €</h2><p>${name} | ${email}</p><p>Adresse: ${adresse||'-'}</p><p>Finanzierung: ${finLabel} | Eigenkapital: ${eigenkapital_eur||'-'}</p><p>Bindefrist: ${bindefrist_wert} ${bindefrist_einheit}</p><p>${(nachricht||'-').replace(/\n/g,'<br>')}</p><p style="font-size:11px;color:#aaa">${ts}</p>`;
  await sendEmail({ from: SEND_FROM, to: NOTIFY_TO, replyTo: email, subject: `Kaufangebot ${betragFormatted} € – ${name}`, html }).catch(e => console.error('Mail-Fehler:', e));
  res.status(200).json({ ok: true });
};
