const test = require('node:test');
const assert = require('node:assert/strict');
const handler = require('../api/page.js');

function render(url, host = 'preview.example.com') {
  const response = { headers: {}, body: '' };
  handler({ method: 'GET', headers: { host }, url }, {
    setHeader(name, value) { response.headers[name] = value; },
    end(body = '') { response.body = body; },
    set statusCode(value) { response.status = value; }
  });
  return response;
}

test('challenge metadata carries the same board and result into the player URL', () => {
  const page = render('/?seed=2154251899&first=154&w=16&h=16&m=40&result=lose&time=131&cleared=74');
  assert.match(page.body, /<meta name="twitter:player" content="https:\/\/minisweeper-x\.vercel\.app\/\?embed=1&amp;seed=2154251899&amp;first=154&amp;w=16&amp;h=16&amp;m=40&amp;result=lose&amp;time=131&amp;cleared=74">/);
  assert.match(page.body, /<meta name="twitter:image" content="https:\/\/minisweeper-x\.vercel\.app\/player-card\.jpg">/);
});

test('invalid challenge data never appears in player metadata', () => {
  const page = render('/?seed=1&first=999&w=9&h=9&m=10&result=win&time=20&cleared=100');
  assert.match(page.body, /content="https:\/\/minisweeper-x\.vercel\.app\/\?embed=1"/);
  assert.doesNotMatch(page.body, /first=999/);
});

test('a preview host still points to the production player', () => {
  const page = render('/');
  assert.match(page.body, /content="https:\/\/minisweeper-x\.vercel\.app\/\?embed=1"/);
  assert.doesNotMatch(page.body, /preview\.example\.com/);
});
