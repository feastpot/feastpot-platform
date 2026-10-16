const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const SIGNALS = {
  heapExhaustion: /heap out of memory|reached heap limit|allocation failed/gi,
  processKilled: /\bKilled\b|\bSIGKILL\b/g,
  serverRestart: /restarting (?:the )?(?:server|worker)/gi,
  unhandledError: /uncaughtException|unhandledRejection/gi,
  connectionFailure: /ECONNREFUSED|ECONNRESET|EPIPE|ERR_EMPTY_RESPONSE/g,
  databaseFailure: /P1001|P1002|P2024|remaining connection slots|too many clients/gi,
};

// Read only a bounded tail. Never include log text, URLs, headers, command
// arguments or environment values in the returned diagnostics.
function readTail(file) {
  let fd;
  try {
    fd = fs.openSync(file, 'r');
    const { size } = fs.fstatSync(fd);
    const buffer = Buffer.alloc(Math.min(size, 256 * 1024));
    const bytes = fs.readSync(fd, buffer, 0, buffer.length, size - buffer.length);
    return buffer.subarray(0, bytes).toString('utf8');
  } catch {
    return null;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

function summarizeLog(text) {
  if (text === null) return { available: false };
  return {
    available: true,
    signals: Object.fromEntries(
      Object.entries(SIGNALS).map(([name, pattern]) => [name, [...text.matchAll(pattern)].length]),
    ),
  };
}

function readInteger(file) {
  const text = readTail(file)?.trim();
  if (!text || !/^\d+$/.test(text)) return null;
  const value = Number(text);
  return Number.isSafeInteger(value) ? value : null;
}

function collectDiagnostics(directory = os.tmpdir()) {
  const services = Object.fromEntries(
    ['api', 'web'].map((name) => {
      const prefix = path.join(directory, `vendor-e2e-${name}`);
      const pid = readInteger(`${prefix}.pid`);
      let processPresent = null;
      if (pid !== null && pid > 0) {
        try {
          process.kill(pid, 0);
          processPresent = true;
        } catch (error) {
          if (error.code === 'ESRCH') processPresent = false;
        }
      }
      return [
        name,
        {
          processPresent,
          exitCode: readInteger(`${prefix}.exit`),
          log: summarizeLog(readTail(`${prefix}.log`)),
        },
      ];
    }),
  );
  const events = readTail('/sys/fs/cgroup/memory.events');
  return {
    capturedAt: new Date().toISOString(),
    hostTotalMemoryBytes: os.totalmem(),
    hostFreeMemoryBytes: os.freemem(),
    memoryEvents:
      events === null
        ? null
        : Object.fromEntries(
            [...events.matchAll(/^(oom|oom_kill|max) (\d+)$/gm)].map(([, name, value]) => [
              name,
              Number(value),
            ]),
          ),
    services,
  };
}

module.exports = { collectDiagnostics, summarizeLog };

if (require.main === module) {
  console.log(JSON.stringify(collectDiagnostics(), null, 2));
}
