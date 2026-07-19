const { sanitize, isRateLimited, isGibberish, hashIp, getSupabase, sendEmail, NOTIFY_TO, NOTIFY_CC_MARTIN, SEND_FROM } = require('../lib/shared');
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
  const vorname = sanitize(body.vorname || '');
  const nachname = sanitize(body.nachname || '');
  const email = sanitize((body.email || '').toLowerCase());
  const telefon = sanitize(body.telefon || '');
  const adresse = sanitize(body.adresse || '');
  const nachricht = sanitize(body.nachricht || '');
  const finanzierung_status = sanitize(body.finanzierung_status || '');
  const betrag_eur = parseFloat(body.betrag_eur);
  if (isGibberish(nachricht) || isGibberish(vorname)) return res.status(200).json({ ok: true });
  if (!vorname || !nachname || !email) return res.status(400).json({ error: 'Vorname, Nachname und E-Mail sind Pflichtfelder.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Ungültige E-Mail-Adresse.' });
  if (!betrag_eur || betrag_eur <= 0 || betrag_eur > 100000000) return res.status(400).json({ error: 'Bitte geben Sie ein gültiges Kaufgebot an.' });
  const supabase = getSupabase();
  const { data: buyer, error: buyerError } = await supabase.from('keks_buyer_registrations').upsert({ email, vorname, nachname, telefon, adresse, ip_hash: hashIp(ip) }, { onConflict: 'email' }).select('id').single();
  if (buyerError || !buyer) { console.error('Supabase buyer upsert error:', buyerError); return res.status(500).json({ error: 'Speicherfehler.' }); }
  const { error: bidError } = await supabase.from('keks_buyer_bids').insert({ buyer_id: buyer.id, betrag_eur, nachricht, finanzierung_status });
  if (bidError) { console.error('Supabase bid insert error:', bidError); return res.status(500).json({ error: 'Speicherfehler.' }); }
  const ts = new Date().toLocaleString('de-DE');
  const betragFormatted = betrag_eur.toLocaleString('de-DE');
  const html = `<h2>Neues Kaufgebot: ${betragFormatted} €</h2><p>${vorname} ${nachname} | ${email} | ${telefon||'-'}</p><p>Adresse: ${adresse||'-'} | Finanzierung: ${finanzierung_status||'-'}</p><p>${(nachricht||'-').replace(/\n/g,'<br>')}</p><p style="font-size:11px;color:#aaa">${ts}</p>`;
  await sendEmail({ from: SEND_FROM, to: NOTIFY_TO, cc: NOTIFY_CC_MARTIN, replyTo: email, subject: `Kaufgebot ${betragFormatted} € – ${vorname} ${nachname}`, html }).catch(e => console.error('Mail-Fehler:', e));
  res.status(200).json({ ok: true });
};
