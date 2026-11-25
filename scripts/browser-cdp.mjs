// Small local-only Chrome DevTools test client. Start Chrome with port 9333.
export async function connect({port=9333}={}) {
  const testUrl = process.env.MOSPEADA_TEST_URL || 'http://127.0.0.1:5173'
  const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
  const page = pages.find(p => p.type === 'page' && p.url.startsWith(testUrl))
  if (!page) throw Error(`Open the MOSPEADA dev server in the test Chrome on port ${port}`)
  const socket = new WebSocket(page.webSocketDebuggerUrl), pending = new Map(), events = []
  let id = 0
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject })
  socket.onmessage = event => {
    const message = JSON.parse(event.data)
    if (message.id) {
      const item = pending.get(message.id); pending.delete(message.id)
      if (message.error) item.reject(Error(JSON.stringify(message.error))); else item.resolve(message.result)
    } else events.push(message)
  }
  const send = (method, params = {}) => new Promise((resolve, reject) => { const key = ++id; pending.set(key, { resolve, reject }); socket.send(JSON.stringify({ id: key, method, params })) })
  await send('Runtime.enable'); await send('Page.enable'); await send('Log.enable')
  const evaluate = async expression => {
    const response = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (response.exceptionDetails) throw Error(JSON.stringify(response.exceptionDetails))
    return response.result.value
  }
  const openSettings = async section => {
    await evaluate(`(()=>{if(!document.querySelector('.ride-settings'))[...document.querySelectorAll('.ride-actions button')].find(b=>b.textContent==='Ajustes').click()})()`)
    await evaluate(`(()=>{const b=[...document.querySelectorAll('.ride-settings-tabs button')].find(b=>b.textContent===${JSON.stringify(section)});if(!b)throw Error('Missing settings section');b.click()})()`)
  }
  const closeSettings = () => evaluate(`document.querySelector('[aria-label="Cerrar ajustes"]')?.click()`)
  return { send, evaluate, events, openSettings, closeSettings, close: () => socket.close() }
}
