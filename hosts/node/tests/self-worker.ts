// T-669: run inside a Bun Worker by node-host.spec.ts; answers what nodeProcesses says about this process from here.
import { nodeProcesses } from '../host'

declare const self: { postMessage: (m: unknown) => void }

const me = nodeProcesses.self()
const alive = me ? await nodeProcesses.alive(me) : undefined
self.postMessage({ me, alive, uptime: process.uptime() })
