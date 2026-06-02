const ALGORITHM = "AES-GCM"
const IV_BYTES = 12

export async function encryptToken(secret: string, token: string): Promise<string> {
  const key = await importSecretKey(secret)
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const plaintext = new TextEncoder().encode(token)
  const ciphertext = await crypto.subtle.encrypt({ name: ALGORITHM, iv }, key, plaintext)
  return `${toBase64Url(iv)}.${toBase64Url(new Uint8Array(ciphertext))}`
}

export async function decryptToken(secret: string, encrypted: string): Promise<string> {
  const [ivText, ciphertextText] = encrypted.split(".")
  if (!ivText || !ciphertextText) {
    throw new Error("Invalid encrypted token")
  }

  const key = await importSecretKey(secret)
  const iv = toArrayBuffer(fromBase64Url(ivText))
  const ciphertext = toArrayBuffer(fromBase64Url(ciphertextText))
  const plaintext = await crypto.subtle.decrypt({ name: ALGORITHM, iv }, key, ciphertext)
  return new TextDecoder().decode(plaintext)
}

async function importSecretKey(secret: string): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret))
  return crypto.subtle.importKey("raw", digest, ALGORITHM, false, ["encrypt", "decrypt"])
}

function toBase64Url(bytes: Uint8Array): string {
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("")
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "")
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.padEnd(value.length + ((4 - (value.length % 4)) % 4), "=")
  const base64 = padded.replaceAll("-", "+").replaceAll("_", "/")
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(buffer).set(bytes)
  return buffer
}
