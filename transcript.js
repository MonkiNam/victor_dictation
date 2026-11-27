// Vercel Serverless Function: /api/transcript?v=VIDEO_ID&lang=en
async function getCaptions(id, lang) {
  const r = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'user-agent': 'com.google.android.youtube/20.10.38 (Linux; U; Android 14)',
    },
    body: JSON.stringify({
      context: { client: { clientName: 'ANDROID', clientVersion: '20.10.38', androidSdkVersion: 34, hl: 'en' } },
      videoId: id,
    }),
  });
  const d = await r.json();
  const tracks = d?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
  if (!tracks.length) throw new Error('video này không có phụ đề hoặc YouTube đang chặn');
  const t =
    tracks.find((x) => x.languageCode === lang && x.kind !== 'asr') ||
    tracks.find((x) => x.languageCode.startsWith(lang)) ||
    tracks[0];
  const c = await (await fetch(t.baseUrl.replace(/&fmt=\w+/, '') + '&fmt=json3')).json();
  const segs = (c.events || [])
    .filter((e) => e.segs)
    .map((e) => ({
      s: e.tStartMs / 1000,
      e: (e.tStartMs + (e.dDurationMs || 2000)) / 1000,
      t: e.segs.map((x) => x.utf8).join('').replace(/\s+/g, ' ').trim(),
    }))
    .filter((x) => x.t);
  segs.forEach((x, i) => { if (segs[i + 1] && segs[i + 1].s > x.s) x.e = Math.min(x.e, segs[i + 1].s); });
  return { lang: t.languageCode, auto: t.kind === 'asr', segs };
}

module.exports = async (req, res) => {
  const id = (req.query && req.query.v) || '';
  const lang = (req.query && req.query.lang) || 'en';
  if (!/^[\w-]{11}$/.test(id)) return res.status(400).json({ error: 'ID video không hợp lệ' });
  try { res.status(200).json(await getCaptions(id, lang)); }
  catch (e) { res.status(502).json({ error: e.message }); }
};
