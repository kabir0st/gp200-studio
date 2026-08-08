#!/usr/bin/env node
/**
 * GP-200 SysEx capture decoder.
 *
 * Turns a USBPcap capture (see docs/protocol-capture.md §2) into a list of
 * whole GP-200 SysEx messages, so a capture can be diffed against the ordered
 * action list in its sibling `actions.md` to work out which byte carries which
 * field.
 *
 * How it works: the GP-200 is a USB-MIDI class device, so a SysEx message is
 * split across 4-byte USB-MIDI event packets (1 header nibble-pair + up to 3
 * MIDI bytes). Wireshark already reassembles those, so this just harvests
 * tshark's "Reassembled Message" hex blocks and keeps the ones carrying the
 * GP-200 header `F0 21 25 7E 47 50 2D 32`.
 *
 * Message shape (see src/core/SysExCodec.ts): byte[8] = CMD (0x11 host
 * request, 0x12 set/notify), byte[9] = sub-command. Some subs carry a
 * nibble-encoded payload (two 0x0N bytes per real byte) — pass --nibble to
 * also print the decoded form.
 *
 * Usage:
 *   node scripts/decode-sysex-capture.mjs <capture.pcapng> [options]
 *
 *   --cmd 12          only show messages with this CMD byte (hex)
 *   --sub 14          only show messages with this sub byte (hex)
 *   --nibble          also print the nibble-decoded payload from byte 13
 *   --diff            group identical messages and show the byte offsets that
 *                     differ within each (cmd, sub, length) group
 *   --summary         only print the (cmd, sub, length) histogram
 *
 * Example — isolate the CTRL assignment write from its capture:
 *   node scripts/decode-sysex-capture.mjs dumps/ctrl-assignment/ctrl-assignment.pcapng \
 *     --cmd 12 --diff
 */
import { execFileSync } from 'node:child_process';

const GP_HEADER = [0xF0, 0x21, 0x25, 0x7E, 0x47, 0x50, 0x2D, 0x32];

function parseArgs(argv) {
  const opts = { file: null, cmd: null, sub: null, nibble: false, diff: false, summary: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--nibble') opts.nibble = true;
    else if (arg === '--diff') opts.diff = true;
    else if (arg === '--summary') opts.summary = true;
    else if (arg === '--cmd') opts.cmd = parseInt(argv[++i], 16);
    else if (arg === '--sub') opts.sub = parseInt(argv[++i], 16);
    else if (!arg.startsWith('--')) opts.file = arg;
  }
  return opts;
}

/** Run tshark and harvest its reassembled-SysEx hex blocks. */
function extractMessages(file) {
  let out;
  try {
    out = execFileSync(
      'tshark',
      ['-r', file, '-Y', 'usb.transfer_type==3', '-x'],
      { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 },
    );
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.error('tshark not found. Install Wireshark/tshark (WSL: sudo apt install tshark).');
      process.exit(1);
    }
    throw err;
  }

  const messages = [];
  let current = null;
  for (const line of out.split('\n')) {
    if (line.startsWith('Reassembled Message')) {
      current = [];
      continue;
    }
    if (current === null) continue;
    // Hex-dump rows look like: "0000  f0 21 25 7e ...   .!%~..."
    const match = line.match(/^[0-9a-f]{4}\s+((?:[0-9a-f]{2} )+)/);
    if (match) {
      for (const byte of match[1].trim().split(' ')) current.push(parseInt(byte, 16));
    } else if (line.trim() === '' && current.length > 0) {
      messages.push(Uint8Array.from(current));
      current = null;
    }
  }
  if (current && current.length > 0) messages.push(Uint8Array.from(current));

  return messages.filter((msg) => GP_HEADER.every((byte, i) => msg[i] === byte));
}

/** Mirror of SysExCodec.nibbleDecode: two 0x0N bytes → one real byte. */
function nibbleDecode(data) {
  const out = new Uint8Array(Math.floor(data.length / 2));
  for (let i = 0; i < out.length; i++) {
    out[i] = ((data[2 * i] & 0x0F) << 4) | (data[2 * i + 1] & 0x0F);
  }
  return out;
}

const hex = (bytes) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join(' ');

/** Byte offsets that are not identical across every message in the group. */
function differingOffsets(group) {
  const offsets = [];
  for (let i = 0; i < group[0].length; i++) {
    if (group.some((msg) => msg[i] !== group[0][i])) offsets.push(i);
  }
  return offsets;
}

const opts = parseArgs(process.argv.slice(2));
if (!opts.file) {
  console.error('Usage: node scripts/decode-sysex-capture.mjs <capture.pcapng> [--cmd 12] [--sub 14] [--nibble] [--diff] [--summary]');
  process.exit(1);
}

let messages = extractMessages(opts.file);
const total = messages.length;
if (opts.cmd !== null) messages = messages.filter((msg) => msg[8] === opts.cmd);
if (opts.sub !== null) messages = messages.filter((msg) => msg[9] === opts.sub);

console.log(`${opts.file}: ${total} GP-200 SysEx messages, ${messages.length} after filtering\n`);

// (cmd, sub, length) histogram — the first thing to look at: it tells you how
// many distinct frame kinds the capture holds and how often each fired.
const groups = new Map();
for (const msg of messages) {
  const key = `${msg[8].toString(16).padStart(2, '0')}/${msg[9].toString(16).padStart(2, '0')} len=${msg.length}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(msg);
}

console.log('CMD/sub   len   count');
for (const [key, group] of groups) {
  console.log(`  ${key.padEnd(20)} x${group.length}`);
}

if (opts.summary) process.exit(0);

for (const [key, group] of groups) {
  console.log(`\n${'='.repeat(72)}\n${key}  (${group.length} message${group.length === 1 ? '' : 's'})`);

  if (opts.diff && group.length > 1) {
    const offsets = differingOffsets(group);
    console.log(`differing offsets: ${offsets.length ? offsets.join(', ') : '(all identical)'}`);
    for (const offset of offsets) {
      const values = group.map((msg) => msg[offset].toString(16).padStart(2, '0'));
      console.log(`  [${String(offset).padStart(3)}] ${values.join(' → ')}`);
    }
  }

  group.forEach((msg, i) => {
    console.log(`\n#${i + 1} ${hex(msg)}`);
    if (opts.nibble && msg.length > 14) {
      const payload = nibbleDecode(msg.subarray(13, msg.length - 1));
      console.log(`   nibble-decoded[13:]: ${hex(payload)}`);
    }
  });
}
