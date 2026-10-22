/**
 * HLS Stream & Segment CORS Reverse Proxy
 * Enables cross-origin in-browser playback for any HLS .m3u8 stream and .ts segments
 */

const http = require('node:http');
const https = require('node:https');
const { URL } = require('node:url');

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

/**
 * Resolve relative URI against master URL
 */
function resolveUrl(relativeOrAbsolute, base) {
  try {
    return new URL(relativeOrAbsolute, base).href;
  } catch (err) {
    return relativeOrAbsolute;
  }
}

/**
 * Handle M3U8 Manifest Proxy
 */
async function handleManifestProxy(req, res) {
  const targetUrl = req.query.url;
  if (!targetUrl) {
    return res.status(400).json({ error: 'Missing "url" query parameter' });
  }

  try {
    const fetchHeaders = {
      'User-Agent': USER_AGENT,
      'Accept': '*/*'
    };

    if (req.headers.range) {
      fetchHeaders['Range'] = req.headers.range;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const remoteRes = await fetch(targetUrl, {
      method: 'GET',
      headers: fetchHeaders,
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (!remoteRes.ok) {
      return res.status(remoteRes.status).send(`Failed to fetch upstream manifest: HTTP ${remoteRes.status}`);
    }

    const rawText = await remoteRes.text();
    const baseUrl = remoteRes.url || targetUrl;

    // Check if this is indeed an M3U8 playlist
    if (!rawText.includes('#EXTM3U')) {
      // Direct pass-through if not M3U8
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Content-Type', remoteRes.headers.get('content-type') || 'application/vnd.apple.mpegurl');
      return res.send(rawText);
    }

    // Rewrite lines to proxy through our endpoints
    const lines = rawText.split(/\r?\n/);
    const rewritten = [];

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];
      const trimmed = line.trim();

      if (!trimmed) {
        rewritten.push(line);
        continue;
      }

      // Handle tags with URI="..." (e.g. #EXT-X-MEDIA, #EXT-X-KEY)
      if (trimmed.startsWith('#EXT-X-MEDIA') || trimmed.startsWith('#EXT-X-KEY')) {
        line = line.replace(/URI="([^"]*)"/g, (match, uri) => {
          const absolute = resolveUrl(uri, baseUrl);
          const endpoint = absolute.includes('.m3u8') ? '/api/proxy/stream.m3u8' : '/api/proxy/segment';
          return `URI="${endpoint}?url=${encodeURIComponent(absolute)}"`;
        });
        rewritten.push(line);
      }
      // If tag line, keep unchanged
      else if (trimmed.startsWith('#')) {
        rewritten.push(line);
      }
      // URI line: could be variant playlist (.m3u8) or transport segment (.ts, .m4s)
      else {
        const absolute = resolveUrl(trimmed, baseUrl);
        if (absolute.includes('.m3u8') || absolute.includes('playlist') || absolute.includes('manifest')) {
          rewritten.push(`/api/proxy/stream.m3u8?url=${encodeURIComponent(absolute)}`);
        } else {
          rewritten.push(`/api/proxy/segment?url=${encodeURIComponent(absolute)}`);
        }
      }
    }

    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

    return res.send(rewritten.join('\n'));

  } catch (err) {
    console.error(`[Proxy] Error proxying manifest ${targetUrl}:`, err.message);
    return res.status(502).json({ error: `Proxy failed: ${err.message}` });
  }
}

/**
 * Handle Media Segment Proxy (.ts, .m4s, .aac)
 */
async function handleSegmentProxy(req, res) {
  const targetUrl = req.query.url;
  if (!targetUrl) {
    return res.status(400).json({ error: 'Missing "url" query parameter' });
  }

  try {
    const fetchHeaders = {
      'User-Agent': USER_AGENT,
      'Accept': '*/*'
    };

    if (req.headers.range) {
      fetchHeaders['Range'] = req.headers.range;
    }

    const controller = new AbortController();
    req.on('close', () => controller.abort());

    const isHead = req.method === 'HEAD';
    const remoteRes = await fetch(targetUrl, {
      method: isHead ? 'HEAD' : 'GET',
      headers: fetchHeaders,
      signal: controller.signal
    });

    if (!remoteRes.ok) {
      return res.status(remoteRes.status).send(`Upstream segment returned ${remoteRes.status}`);
    }

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Content-Type', remoteRes.headers.get('content-type') || 'video/mp2t');

    if (remoteRes.headers.get('content-length')) {
      res.setHeader('Content-Length', remoteRes.headers.get('content-length'));
    }
    if (remoteRes.headers.get('content-range')) {
      res.setHeader('Content-Range', remoteRes.headers.get('content-range'));
      res.status(206);
    }

    if (isHead) {
      return res.end();
    }

    // Stream remote body to client response with error handling
    const { Readable } = require('node:stream');
    const stream = Readable.fromWeb(remoteRes.body);
    stream.on('error', () => {}); // Safely absorb client aborts
    res.on('error', () => {});
    stream.pipe(res);

  } catch (err) {
    if (err.name === 'AbortError') return;
    console.error(`[Proxy] Error streaming segment ${targetUrl}:`, err.message);
    if (!res.headersSent) {
      res.status(502).json({ error: `Segment proxy error: ${err.message}` });
    }
  }
}

module.exports = {
  handleManifestProxy,
  handleSegmentProxy,
  resolveUrl
};
