/**
 * Loads Thmanyah from the compiled, obfuscated chunk built by scripts/fonts.mjs.
 * No font file is ever served, as the font licence requires. The original bytes are restored in
 * memory and given to the browser unmodified.
 */
export async function loadFonts(): Promise<void> {
  const { FACES, SALT } = await import('@/generated/fonts')
  await Promise.all(
    FACES.map(async ({ family, weight, data }) => {
      const bin = atob(data)
      const bytes = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i) ^ ((SALT + i * 31) & 0xff)
      const face = new FontFace(family, bytes.buffer, { weight: String(weight), display: 'swap' })
      document.fonts.add(await face.load())
    }),
  )
}
