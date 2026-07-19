const { sanitize, isRateLimited, isGibberish, hashIp, getSupabase, sendEmail, NOTIFY_TO, SEND_FROM, hashPassword, signSession, SESSION_COOKIE } = require('../lib/shared');
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
  const firmenname = sanitize(body.firmenname || '');
  const adresse = sanitize(body.adresse || '');
  const taetigkeitsbereich = sanitize(body.taetigkeitsbereich || '');
  const arbeitsweise = (body.arbeitsweise === 'team') ? 'team' : 'allein';
  let kollegen_anzahl = parseInt(body.kollegen_anzahl, 10);
  if (arbeitsweise !== 'team' || isNaN(kollegen_anzahl) || kollegen_anzahl < 1) kollegen_anzahl = 0;
  const website = sanitize(body.website || '');
  const email = sanitize((body.email || '').toLowerCase());
  const telefon = sanitize(body.telefon || '');
  const kundenbestand = !!body.kundenbestand;
  const interessenten = !!body.interessenten;
  const portale = !!body.portale;
  const social_media = !!body.social_media;
  const print = !!body.print;
  const eigene_website = !!body.eigene_website;
  const neue_aktionen = !!body.neue_aktionen;
  const nachricht = sanitize(body.nachricht || '');
  const password = String(body.password || '');
  if (isGibberish(nachricht) || isGibberish(name)) return res.status(200).json({ ok: true });
  if (!name || !email || !password) return res.status(400).json({ error: 'Name, E-Mail und Passwort sind Pflichtfelder.' });
  if (!taetigkeitsbereich) return res.status(400).json({ error: 'Bitte geben Sie Ihren regionalen Tätigkeitsbereich an.' });
  if (website && !/^https?:\/\/.+/i.test(website)) return res.status(400).json({ error: 'Bitte geben Sie eine gültige Website-Adresse (mit https://) an.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Ungültige E-Mail-Adresse.' });
  if (password.length < 8) return res.status(400).json({ error: 'Passwort muss mindestens 8 Zeichen haben.' });
  const supabase = getSupabase();
  const { data: existing } = await supabase.from('keks_broker_accounts').select('id').eq('email', email).maybeSingle();
  if (existing) return res.status(400).json({ error: 'Für diese E-Mail existiert bereits ein Konto. Bitte einloggen.' });
  const { hash, salt } = hashPassword(password);
  const { data: created, error: dbError } = await supabase.from('keks_broker_accounts').insert({
    name, firmenname, adresse, email, telefon,
    taetigkeitsbereich, arbeitsweise, kollegen_anzahl, website,
    vermarktung_kundenbestand: kundenbestand,
    vermarktung_interessenten: interessenten,
    vermarktung_portale: portale,
    vermarktung_social_media: social_media,
    vermarktung_print: print,
    vermarktung_eigene_website: eigene_website,
    vermarktung_neue_aktionen: neue_aktionen,
    nachricht, password_hash: hash, password_salt: salt, ip_hash: hashIp(ip)
  }).select('id').single();
  if (dbError || !created) { console.error('Supabase broker insert error:', dbError); return res.status(500).json({ error: 'Speicherfehler.' }); }
  const ts = new Date().toLocaleString('de-DE');
  const vermarktungList = [
    kundenbestand ? 'Bestehender Kundenbestand' : null,
    interessenten ? 'Es gibt bereits interessierte Kunden' : null,
    portale ? 'Immobilienportale' : null,
    social_media ? 'Social-Media-Marketing' : null,
    print ? 'Print-/Zeitungsanzeigen' : null,
    eigene_website ? 'Eigenes Exposé auf Firmen-Website' : null,
    neue_aktionen ? 'Neue Marketing-Aktionen geplant' : null
  ].filter(Boolean).join(', ') || '-';
  const teamText = arbeitsweise === 'team' ? `arbeitet mit ${kollegen_anzahl} Kolleg:in(nen)` : 'arbeitet allein';
  const html = `<h2>Neue Makler-Registrierung</h2><p>${name}${firmenname ? ' ('+firmenname+')' : ''} | ${email} | ${telefon||'-'}</p><p>Adresse: ${adresse||'-'}</p><p>Tätigkeitsbereich: ${taetigkeitsbereich}</p><p>${teamText}</p><p>Website: ${website||'-'}</p><p>Vermarktung: ${vermarktungList}</p><p>${(nachricht||'-').replace(/\n/g,'<br>')}</p><p style="font-size:11px;color:#aaa">${ts}</p>`;
  await sendEmail({ from: SEND_FROM, to: NOTIFY_TO, replyTo: email, subject: `Makler-Registrierung – ${name}`, html }).catch(e => console.error('Mail-Fehler:', e));
  const token = signSession({ id: created.id, email, exp: Date.now() + 90 * 24 * 60 * 60 * 1000 });
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${90 * 24 * 60 * 60}`);
  res.status(200).json({ ok: true });
};
