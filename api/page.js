const fs = require('node:fs');
const path = require('node:path');

const template = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');
const challengeKeys = ['seed', 'first', 'w', 'h', 'm', 'result', 'time', 'cleared'];

function integerParam(params, key, min, max) {
  const value = params.get(key);
  if (value === null || !/^(?:0|[1-9]\d*)$/.test(value)) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= min && number <= max ? number : null;
}

function challengeParams(params) {
  if (!challengeKeys.every(key => params.has(key))) return null;
  const seed = integerParam(params, 'seed', 0, 0xffffffff);
  const first = integerParam(params, 'first', 0, 2499);
  const w = integerParam(params, 'w', 1, 50);
  const h = integerParam(params, 'h', 1, 50);
  const m = integerParam(params, 'm', 0, 2500);
  const time = integerParam(params, 'time', 0, 86400 * 30);
  const cleared = integerParam(params, 'cleared', 0, 100);
  const result = params.get('result');
  if ([seed, first, w, h, m, time, cleared].some(value => value === null) ||
      !['win', 'lose'].includes(result) || m > w * h || first >= w * h) return null;
  return { seed, first, w, h, m, result, time, cleared };
}

function escapeAttribute(value) {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function pageHtml(baseUrl, params) {
  const player = new URL(baseUrl);
  player.searchParams.set('embed', '1');
  player.searchParams.set('v', '2');
  const challenge = challengeParams(params);
  if (challenge) {
    for (const key of challengeKeys) player.searchParams.set(key, challenge[key]);
  }
  return template
    .replace(/<meta name="twitter:player" content="[^"]*">/,
      `<meta name="twitter:player" content="${escapeAttribute(player.href)}">`)
    .replace(/<meta name="twitter:image" content="[^"]*">/,
      `<meta name="twitter:image" content="${escapeAttribute(new URL('player-card.jpg', baseUrl).href)}">`);
}

function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.statusCode = 405;
    res.setHeader('Allow', 'GET, HEAD');
    res.end();
    return;
  }
  const host = req.headers.host;
  if (typeof host !== 'string' || !/^[A-Za-z0-9.-]+(?::\d{1,5})?$/.test(host)) {
    res.statusCode = 400;
    res.end('Invalid host');
    return;
  }
  const baseUrl = `https://${host}/`;
  const params = new URL(req.url || '/', baseUrl).searchParams;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.end(req.method === 'HEAD' ? '' : pageHtml(baseUrl, params));
}

module.exports = handler;
module.exports.challengeParams = challengeParams;
module.exports.pageHtml = pageHtml;
