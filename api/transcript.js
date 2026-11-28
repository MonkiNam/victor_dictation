// Vercel Serverless Function: /api/transcript?v=VIDEO_ID&lang=en

const CLIENTS = [
  { name: 'ANDROID', ua: 'com.google.android.youtube/20.10.38 (Linux; U; Android 14)',
    ctx: { clientName: 'ANDROID', clientVersion: '20.10.38', androidSdkVersion: 34, hl: 'en' } },
  { name: 'IOS', ua: 'com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X;)',
    ctx: { clientName: 'IOS', clientVersion: '20.10.4', deviceModel: 'iPhone16,2', hl: 'en' } },
  { name: 'TV', ua: 'Mozilla/5.0 (PlayStation; PlayStation 4/12.00) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.4 Safari/605.1.15',
    ctx: { clientName: 'TVHTML5_SIMPLY_EMBEDDED_PLAYER', clientVersion: '2.0', hl: 'en' }, third: true },
];

async function tryClient(c, id, lang) {
  const body = { context: { client: c.ctx }, videoId: id };
  if (c.third) body.context.thirdParty = { embedUrl: 'https://www.google.com' };
  const r = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': c.ua },
    body: JSON.stringify(body),
  });
  const d = await r.json();
  const ps = d?.playabilityStatus;
  const tracks = d?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
  if (!tracks.length) {
    throw new Error(c.name + ': ' + (ps ? ps.status + (ps.reason ? ' - ' + ps.reason : '') : 'không có dữ liệu') +
      (ps && ps.status === 'OK' ? ' (video không có phụ đề)' : ''));
  }
  const t =
    tracks.find((x) => x.languageCode === lang && x.kind !== 'asr') ||
    tracks.find((x) => x.languageCode.startsWith(lang)) ||
    tracks[0];
  const cr = await fetch(t.baseUrl.replace(/&fmt=\w+/, '') + '&fmt=json3', { headers: { 'user-agent': c.ua } });
  const txt = await cr.text();
  if (!txt.trim()) throw new Error(c.name + ': YouTube trả về phụ đề rỗng');
  const j = JSON.parse(txt);
  const segs = (j.events || [])
    .filter((e) => e.segs)
    .map((e) => ({
      s: e.tStartMs / 1000,
      e: (e.tStartMs + (e.dDurationMs || 2000)) / 1000,
      t: e.segs.map((x) => x.utf8).join('').replace(/\s+/g, ' ').trim(),
    }))
    .filter((x) => x.t);
  segs.forEach((x, i) => { if (segs[i + 1] && segs[i + 1].s > x.s) x.e = Math.min(x.e, segs[i + 1].s); });
  if (!segs.length) throw new Error(c.name + ': phụ đề trống');
  return { lang: t.languageCode, auto: t.kind === 'asr', via: c.name, segs };
}

async function getCaptions(id, lang) {
  const errs = [];
  for (const c of CLIENTS) {
    try { return await tryClient(c, id, lang); }
    catch (e) { errs.push(e.message); }
  }
  throw new Error(errs.join(' | '));
}

module.exports = async (req, res) => {
  const id = (req.query && req.query.v) || '';
  const lang = (req.query && req.query.lang) || 'en';
  if (!/^[\w-]{11}$/.test(id)) return res.status(400).json({ error: 'ID video không hợp lệ' });
  try { res.status(200).json(await getCaptions(id, lang)); }
  catch (e) { res.status(502).json({ error: e.message }); }
};
