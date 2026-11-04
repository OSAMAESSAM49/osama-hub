#!/usr/bin/env node
/**
 * Thmanyah font pipeline, built around the terms of the font licence.
 *
 * The licence allows embedding in web apps "only as part of a compiled, packaged, or obfuscated
 * product" and forbids hosting the font files or making them downloadable. So:
 *   - raw font files live only in the git-ignored fonts-src/ folder;
 *   - the repository holds an AES-256-GCM encrypted pack (fonts/thmanyah.pack.enc), which CI opens
 *     with the FONT_PACK_KEY secret;
 *   - the build compiles the fonts into an obfuscated JS chunk (src/generated/fonts.ts), so no
 *     .woff2 file is ever served. The bytes are passed to the browser FontFace API unmodified.
 *
 *   npm run fonts:pack     encrypt fonts-src/ into the pack, creating .font-pack-key if needed
 *   node scripts/fonts.mjs build     generate src/generated/fonts.ts (runs before dev and build)
 *
 * If no fonts are available the build still succeeds and the app uses its fallback font stack.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const srcDir = join(root, 'fonts-src')
const packFile = join(root, 'fonts', 'thmanyah.pack.enc')
const keyFile = join(root, '.font-pack-key')
const outFile = join(root, 'src', 'generated', 'fonts.ts')

const FACES = [
  { file: 'thmanyahsans-Regular.woff2', family: 'Thmanyah Sans', weight: 400 },
  { file: 'thmanyahsans-Medium.woff2', family: 'Thmanyah Sans', weight: 500 },
  { file: 'thmanyahsans-Bold.woff2', family: 'Thmanyah Sans', weight: 700 },
  { file: 'thmanyahserifdisplay-Medium.woff2', family: 'Thmanyah Serif Display', weight: 500 },
  { file: 'thmanyahserifdisplay-Bold.woff2', family: 'Thmanyah Serif Display', weight: 700 },
  { file: 'thmanyahseriftext-Regular.woff2', family: 'Thmanyah Serif Text', weight: 400 },
]

const readKey = () => {
  const hex = process.env.FONT_PACK_KEY?.trim() || (existsSync(keyFile) ? readFileSync(keyFile, 'utf8').trim() : '')
  return hex ? Buffer.from(hex, 'hex') : null
}

function pack() {
  const missing = FACES.filter((f) => !existsSync(join(srcDir, f.file)))
  if (missing.length) throw new Error(`Missing in fonts-src/: ${missing.map((m) => m.file).join(', ')}`)
  let key = readKey()
  if (!key) {
    key = randomBytes(32)
    writeFileSync(keyFile, key.toString('hex'))
    console.log('Created .font-pack-key (git-ignored). Add its contents as the FONT_PACK_KEY GitHub secret.')
  }
  const manifest = FACES.map((f) => ({ ...f, data: readFileSync(join(srcDir, f.file)).toString('base64') }))
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const body = Buffer.concat([cipher.update(JSON.stringify(manifest)), cipher.final()])
  mkdirSync(dirname(packFile), { recursive: true })
  writeFileSync(packFile, Buffer.concat([iv, cipher.getAuthTag(), body]))
  console.log(`Encrypted ${FACES.length} faces into fonts/thmanyah.pack.enc`)
}

function loadFaces() {
  if (FACES.every((f) => existsSync(join(srcDir, f.file)))) {
    return FACES.map((f) => ({ ...f, data: readFileSync(join(srcDir, f.file)).toString('base64') }))
  }
  const key = readKey()
  if (key && existsSync(packFile)) {
    const raw = readFileSync(packFile)
    const decipher = createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12))
    decipher.setAuthTag(raw.subarray(12, 28))
    return JSON.parse(Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString())
  }
  return null
}

function build() {
  const faces = loadFaces()
  mkdirSync(dirname(outFile), { recursive: true })
  if (!faces) {
    console.warn('[fonts] Thmanyah not available (no fonts-src/ and no FONT_PACK_KEY). Using the fallback font stack.')
    writeFileSync(outFile, 'export const SALT = 0\nexport const FACES: { family: string; weight: number; data: string }[] = []\n')
    return
  }
  const salt = randomBytes(1)[0] | 1
  const encoded = faces.map(({ family, weight, data }) => {
    const bytes = Buffer.from(data, 'base64')
    for (let i = 0; i < bytes.length; i++) bytes[i] ^= (salt + i * 31) & 0xff
    return { family, weight, data: bytes.toString('base64') }
  })
  writeFileSync(
    outFile,
    `export const SALT = ${salt}\nexport const FACES: { family: string; weight: number; data: string }[] = ${JSON.stringify(encoded)}\n`,
  )
  console.log(`[fonts] Compiled ${encoded.length} Thmanyah faces into the app bundle.`)
}

const cmd = process.argv[2]
if (cmd === 'pack') pack()
else if (cmd === 'build') build()
else {
  console.error('Usage: node scripts/fonts.mjs <pack|build>')
  process.exit(1)
}
