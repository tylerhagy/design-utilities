// Sharp video capture: Chrome's screencast frames, timestamped, streamed into ffmpeg at a constant frame rate.
// The browser is launched with --force-device-scale-factor=2 (see record.mjs), so frames come at 2x (2880x1800 for a
// 1440x900 page); Playwright's own recordVideo stays at 1x on this machine's headless shell and is soft in close-ups.
// Frames arrive only when something on screen changes; each one holds until the next, by its own timestamp, so the
// video's clock is the page's clock (t = 0 at `t0`).
import { spawn } from 'child_process'

export async function startCapture(ctx, page, file, { t0, fps = 30, width, height }) {
  const cdp = await ctx.newCDPSession(page)
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-',
    '-vf', `scale=${width}:${height}:flags=lanczos,format=yuv420p`, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '12', '-r', String(fps), file],
    { stdio: ['pipe', 'inherit', 'inherit'] })
  const done = new Promise((res, rej) => ff.on('close', c => c === 0 ? res() : rej(new Error('capture ffmpeg exited ' + c))))
  const slot = ms => Math.max(0, Math.floor((ms - t0) * fps / 1000))
  const write = buf => new Promise(r => ff.stdin.write(buf) ? r() : ff.stdin.once('drain', r))
  let last = null, written = 0, chain = Promise.resolve(), frames = 0
  const fill = async (upto, buf) => { while (written < upto) { await write(buf); written++ } }
  cdp.on('Page.screencastFrame', f => {
    cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {})
    const buf = Buffer.from(f.data, 'base64'), n = slot(f.metadata.timestamp * 1000)
    frames++
    chain = chain.then(async () => { await fill(n, last ?? buf); last = buf })   // earlier slots show the frame before this one
  })
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: width, maxHeight: height })
  return {
    get frames() { return frames },
    async stop(endMs = Date.now()) {
      await cdp.send('Page.stopScreencast').catch(() => {})
      await chain
      if (last) await fill(slot(endMs) + 1, last)
      ff.stdin.end()
      await done
      await cdp.detach().catch(() => {})
    },
  }
}
