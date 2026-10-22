# minisweeper
Open source clone of Minesweeper, built with HTML, CSS, and JS (and a few emoji)

Now also playable on X! https://x.com/miamislice/status/2107655228480717220

Finishing a game opens a result dialog with a Share on X link. The link points to
the game page with the board seed, original safe first cell, settings, and the
shared result. Visitors play the same mine layout and see their result compared
with the challenger before they can share their own challenge.

Opening a fresh challenge shows the challenger’s result, difficulty, board size,
and time in a welcome dialog. Play dismisses the dialog and leaves the board
ready for the first move.

Scores in challenge links are self-reported URL data.

## Vercel hosting

Vercel's free Hobby plan can host this personal project. Import this repository
as a new Vercel project, select **Other** for the framework if prompted, leave
the root directory at the repository root, and deploy. No build command,
environment variables, database, or paid add-ons are needed. `vercel.json`
routes `/` through a small Node function, which writes the challenge parameters
into the server-rendered `twitter:player` URL. CSS, JavaScript, and the card
image remain static. The PHP files are excluded from Vercel deployments.

Use the production `*.vercel.app` URL (or a custom domain connected to that
project) to play and post new challenges. The post link uses the host where the
game was played. A GitHub Pages challenge link already posted on X continues to
use GitHub Pages and will not gain dynamic player metadata from this deployment.

After deployment, check the HTML response for the example challenge:

```sh
curl -s 'https://YOUR-PROJECT.vercel.app/?seed=2154251899&first=154&w=16&h=16&m=40&result=lose&time=131&cleared=74' | grep 'twitter:player'
```

The returned `twitter:player` URL should be on the Vercel host and include
`embed=1` plus every challenge parameter. Run `node --test tests/vercel-page.test.js`
locally to check the metadata generator.

## Apache / PHP hosting

**Do not deploy `index.php` on CentOS 7 or PHP 5.6.** The PHP entry point
requires PHP 8.2 or newer, and the server should run a supported operating
system and a PHP build patched for current security advisories. PHP 5.6 cannot
parse this file. In October 2026, the PHP project's patched upstream releases
are 8.2.35, 8.3.36, 8.4.27, and 8.5.12; a supported distribution may instead
ship a vendor-backported fix. Confirm the version of the **web** PHP handler,
which may differ from `php -v` on the command line.

Copy this directory to an HTTPS Apache document root. The included `.htaccess`
selects `index.php` for directory requests; if your server disables `.htaccess`,
set `DirectoryIndex index.php index.html` in the Apache virtual host instead.
Run `php -l index.php` on the server before enabling the route. Configure the
virtual host to redirect HTTP to HTTPS.
If HTTPS terminates at a reverse proxy and PHP sees an HTTP request, set the
`MINISWEEPER_PUBLIC_BASE_URL` environment variable to the canonical HTTPS
directory URL (for example, `https://play.example.com/minisweeper/`).
The PHP page reads the challenge parameters and emits a `twitter:player` URL
with the same parameters. Apache serves the JavaScript, CSS, and image as
ordinary static files. No database or Node process is needed.

Use the new server URL to play and post challenges. The old GitHub Pages URL
still serves `index.html` with its fixed player URL. Verify the deployed page
before posting a new challenge:

```sh
curl -s 'https://YOUR-HOST/minisweeper/?seed=2154251899&first=154&w=16&h=16&m=40&result=lose&time=131&cleared=74' | grep 'twitter:player'
```

The returned player URL should contain `embed=1` and all challenge parameters.
It must use HTTPS and be reachable in an iframe. If Apache or a proxy sets
`X-Frame-Options: DENY` or a restrictive `Content-Security-Policy` frame-ancestors
directive for this route, adjust that route's headers before sharing it on X.
