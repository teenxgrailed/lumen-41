/**
 * A throwaway certificate chain shaped like Apple's (root -> intermediate with
 * OID 1.2.840.113635.100.6.2.1 -> leaf with 1.2.840.113635.100.6.11.1), made
 * fresh in memory for each test run so no private key is ever committed. The
 * verifier is handed this root instead of Apple's; nothing in production code
 * skips verification.
 */
import { KJUR } from "jsrsasign";
import {
  type KeyObject,
  generateKeyPairSync,
  randomInt,
  sign as signData,
} from "node:crypto";

type KeyPair = { privateKey: KeyObject; prvPem: string; pubPem: string };

function keyPair(): KeyPair {
  const { privateKey, publicKey } = generateKeyPairSync("ec", {
    namedCurve: "P-256",
  });
  return {
    privateKey,
    prvPem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    pubPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
  };
}

function certificate(input: {
  subject: string;
  issuer: string;
  publicKeyPem: string;
  signerPem: string;
  ca: boolean;
  oid?: string;
}): Buffer {
  const ext: unknown[] = [];
  if (input.ca)
    ext.push({ extname: "basicConstraints", cA: true, critical: true });
  if (input.oid) ext.push({ extname: input.oid, extn: "0500" });
  const cert = new KJUR.asn1.x509.Certificate({
    version: 3,
    serial: { int: randomInt(1, 1_000_000) },
    issuer: { str: input.issuer },
    subject: { str: input.subject },
    notbefore: "20200101000000Z",
    notafter: "20991231235959Z",
    sbjpubkey: input.publicKeyPem,
    sigalg: "SHA256withECDSA",
    cakey: input.signerPem,
    ext,
  } as never);
  return Buffer.from(cert.getEncodedHex(), "hex");
}

export type TestChain = {
  root: Buffer;
  sign: (payload: Record<string, unknown>) => string;
};

export function createTestChain(name = "Test"): TestChain {
  const root = keyPair();
  const intermediate = keyPair();
  const leaf = keyPair();
  const rootDer = certificate({
    subject: `/CN=${name} Root`,
    issuer: `/CN=${name} Root`,
    publicKeyPem: root.pubPem,
    signerPem: root.prvPem,
    ca: true,
  });
  const intermediateDer = certificate({
    subject: `/CN=${name} Intermediate`,
    issuer: `/CN=${name} Root`,
    publicKeyPem: intermediate.pubPem,
    signerPem: root.prvPem,
    ca: true,
    oid: "1.2.840.113635.100.6.2.1",
  });
  const leafDer = certificate({
    subject: `/CN=${name} Leaf`,
    issuer: `/CN=${name} Intermediate`,
    publicKeyPem: leaf.pubPem,
    signerPem: intermediate.prvPem,
    ca: false,
    oid: "1.2.840.113635.100.6.11.1",
  });
  const header = {
    alg: "ES256",
    x5c: [leafDer, intermediateDer, rootDer].map((der) =>
      der.toString("base64")
    ),
  };
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  return {
    root: rootDer,
    sign(payload) {
      const input = `${encode(header)}.${encode(payload)}`;
      const signature = signData("sha256", Buffer.from(input), {
        key: leaf.privateKey,
        dsaEncoding: "ieee-p1363",
      });
      return `${input}.${signature.toString("base64url")}`;
    },
  };
}
