/**
 * ANS-104 data items: the signed envelope Arweave bundlers (Irys/Bundlr)
 * accept for uploads, signed with an Arweave RSA wallet (JWK).
 *
 * Layout: signature type (2 bytes LE, 1 = Arweave) | signature (512) |
 * owner (512, the RSA modulus) | target flag (0) | anchor flag (0) |
 * tag count (8 LE) | tag bytes length (8 LE) | Avro-encoded tags | data.
 * The signature is RSA-PSS/SHA-256 over the Arweave "deep hash" of the
 * item's fields; the item ID is the SHA-256 of the signature.
 */

import { createHash, createPrivateKey, createPublicKey, sign, verify, constants, JsonWebKey } from "crypto";

const ARWEAVE_SIGNATURE_TYPE = 1;
const SIGNATURE_LENGTH = 512;
const OWNER_LENGTH = 512;

export interface Tag {
  name: string;
  value: string;
}

const sha384 = (...parts: Buffer[]) => createHash("sha384").update(Buffer.concat(parts)).digest();

/** Arweave deep hash of a blob or (nested) list of blobs */
export function deepHash(data: Buffer | Buffer[]): Buffer {
  if (Array.isArray(data)) {
    let acc = sha384(Buffer.from(`list${data.length}`));
    for (const chunk of data) {
      acc = sha384(acc, deepHash(chunk));
    }
    return acc;
  }
  return sha384(sha384(Buffer.from(`blob${data.byteLength}`)), sha384(data));
}

/** Zigzag varint, as Avro encodes longs */
function avroLong(n: number): Buffer {
  let value = BigInt(n) >= 0n ? BigInt(n) << 1n : (-BigInt(n) << 1n) - 1n;
  const bytes: number[] = [];
  do {
    let byte = Number(value & 0x7fn);
    value >>= 7n;
    if (value > 0n) byte |= 0x80;
    bytes.push(byte);
  } while (value > 0n);
  return Buffer.from(bytes);
}

function avroBytes(text: string): Buffer {
  const bytes = Buffer.from(text);
  return Buffer.concat([avroLong(bytes.length), bytes]);
}

/** Avro array of {name: bytes, value: bytes} records */
export function encodeTags(tags: Tag[]): Buffer {
  if (tags.length === 0) return Buffer.alloc(0);
  return Buffer.concat([
    avroLong(tags.length),
    ...tags.flatMap((t) => [avroBytes(t.name), avroBytes(t.value)]),
    avroLong(0),
  ]);
}

function u64(n: number): Buffer {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64LE(BigInt(n));
  return buffer;
}

function signatureData(owner: Buffer, tags: Buffer, data: Buffer): Buffer {
  return deepHash([
    Buffer.from("dataitem"),
    Buffer.from("1"),
    Buffer.from(String(ARWEAVE_SIGNATURE_TYPE)),
    owner,
    Buffer.alloc(0), // target
    Buffer.alloc(0), // anchor
    tags,
    data,
  ]);
}

/**
 * Build and sign a data item. Returns its bytes and ID.
 */
export function createDataItem(data: Buffer, wallet: JsonWebKey, tags: Tag[] = []): { bytes: Buffer; id: string } {
  if (!wallet.n || !wallet.d) {
    throw new Error("Arweave wallet must be an RSA private key in JWK form");
  }
  const owner = Buffer.from(wallet.n, "base64url");
  if (owner.length !== OWNER_LENGTH) {
    throw new Error("Arweave wallets are 4096-bit RSA keys");
  }

  const rawTags = encodeTags(tags);
  const signature = sign("sha256", signatureData(owner, rawTags, data), {
    key: createPrivateKey({ key: wallet, format: "jwk" }),
    padding: constants.RSA_PKCS1_PSS_PADDING,
    saltLength: 32,
  });

  const signatureType = Buffer.alloc(2);
  signatureType.writeUInt16LE(ARWEAVE_SIGNATURE_TYPE);

  const bytes = Buffer.concat([
    signatureType,
    signature,
    owner,
    Buffer.from([0]), // no target
    Buffer.from([0]), // no anchor
    u64(tags.length),
    u64(rawTags.length),
    rawTags,
    data,
  ]);

  return { bytes, id: createHash("sha256").update(signature).digest("base64url") };
}

/**
 * Check a data item's signature (items with no target or anchor, as
 * createDataItem makes)
 */
export function verifyDataItem(bytes: Buffer): boolean {
  if (bytes.readUInt16LE(0) !== ARWEAVE_SIGNATURE_TYPE) return false;
  const signature = bytes.subarray(2, 2 + SIGNATURE_LENGTH);
  const owner = bytes.subarray(2 + SIGNATURE_LENGTH, 2 + SIGNATURE_LENGTH + OWNER_LENGTH);
  let offset = 2 + SIGNATURE_LENGTH + OWNER_LENGTH;
  if (bytes[offset++] !== 0 || bytes[offset++] !== 0) return false;
  offset += 8; // tag count
  const tagsLength = Number(bytes.readBigUInt64LE(offset));
  offset += 8;
  const tags = bytes.subarray(offset, offset + tagsLength);
  const data = bytes.subarray(offset + tagsLength);

  const key = createPublicKey({ key: { kty: "RSA", n: owner.toString("base64url"), e: "AQAB" }, format: "jwk" });
  return verify("sha256", signatureData(owner, tags, data), { key, padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: 32 }, signature);
}
