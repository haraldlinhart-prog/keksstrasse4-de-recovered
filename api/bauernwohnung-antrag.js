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
  const name = sanitize(body.name || '');
  const adresse = sanitize(body.adresse || '');
  const email = sanitize((body.email || '').toLowerCase());
  const telefon = sanitize(body.telefon || '');
  const taetigkeit = sanitize(body.taetigkeit || '');
  const einkommen_monatlich = sanitize(body.einkommen_monatlich || '');
  const einkommen_quelle = sanitize(body.einkommen_quelle || '');
  const finanzielle_verhaeltnisse = sanitize(body.finanzielle_verhaeltnisse || '');
  const anzahl_personen = sanitize(body.anzahl_personen || '');
  const haustiere = !!body.haustiere;
  const haustiere_welche = sanitize(body.haustiere_welche || '');
  const nachricht = sanitize(body.nachricht || '');
  if (isGibberish(nachricht) || isGibberish(name)) return res.status(200).json({ ok: true });
  if (!name || !email) return res.status(400).json({ error: 'Name und E-Mail sind Pflichtfelder.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Ungültige E-Mail-Adresse.' });
  const supabase = getSupabase();
  const { error: dbError } = await supabase.from('keks_bauernwohnung_antrag').insert({
    name, adresse, email, telefon, taetigkeit, einkommen_monatlich, einkommen_quelle,
    finanzielle_verhaeltnisse, anzahl_personen, haustiere, haustiere_welche, nachricht,
    ip_hash: hashIp(ip)
  });
  if (dbError) { console.error('Supabase insert error:', dbError); return res.status(500).json({ error: 'Speicherfehler.' }); }
  const ts = new Date().toLocaleString('de-DE');
  const html = `<h2>Neuer Mietantrag Bauernwohnung</h2><p>${name} | ${email} | ${telefon||'-'}</p><p>Adresse: ${adresse||'-'}</p><p>Tätigkeit: ${taetigkeit||'-'}</p><p>Monatliches Einkommen: ${einkommen_monatlich||'-'} | Quelle: ${einkommen_quelle||'-'}</p><p>Finanzielle Verhältnisse: ${finanzielle_verhaeltnisse||'-'}</p><p>Personen: ${anzahl_personen||'-'} | Haustiere: ${haustiere ? (haustiere_welche||'ja') : 'nein'}</p><p>${(nachricht||'-').replace(/\n/g,'<br>')}</p><p style="font-size:11px;color:#aaa">${ts}</p>`;
  await sendEmail({ from: SEND_FROM, to: NOTIFY_TO, cc: NOTIFY_CC_MARTIN, replyTo: email, subject: `Mietantrag Bauernwohnung – ${name}`, html }).catch(e => console.error('Mail-Fehler:', e));
  res.status(200).json({ ok: true });
};
