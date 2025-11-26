export async function createOcmfMessage(
  privateKeyHex,
  meterValueStart,
  meterValueEnd,
  startTimestamp,
  endTimestamp
) {
  try {
    const privateKey = await importPrivateKeyFromPkcs8Hex(privateKeyHex);

    const ocmfData = generateMeterValues(
      meterValueStart,
      meterValueEnd,
      startTimestamp,
      endTimestamp
    );

    const signatureHex = await signOcmfData(privateKey, ocmfData);

    const ocmfMessage = buildOcmfMessage(ocmfData, signatureHex);

    return ocmfMessage;
  } catch (error) {
    console.error("Error in createOcmfMessage:", error);

    throw error;
  }
}

function buildOcmfMessage(ocmfData, signatureHex) {
  const msg = "OCMF|" + ocmfData + '|{"SD":"' + signatureHex + '"}';

  return msg;
}

async function signOcmfData(privateKey, ocmfData) {
  const encoder = new TextEncoder();
  const data = encoder.encode(ocmfData);

  const signature = await window.crypto.subtle.sign(
    {
      name: "ECDSA",
      hash: { name: "SHA-256" },
    },
    privateKey,
    data
  );
  const der = rawSigToDer(signature);

  return arrayBufferToHex(der);
}
function pad(num, size = 2) {
  return num.toString().padStart(size, "0");
}

function formatTimestampPlus2Hours(date) {
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hour = pad(date.getHours());
  const minute = pad(date.getMinutes());
  const second = pad(date.getSeconds());
  const millis = pad(date.getMilliseconds(), 3);

  const tz = "+0200";

  return `${year}-${month}-${day}T${hour}:${minute}:${second},${millis}${tz}`;
}

function generateMeterValues(
  meterValueStart,
  meterValueEnd,
  startTimestamp,
  endTimestamp
) {
  const formattedStart = formatTimestampPlus2Hours(startTimestamp);

  var raw_ocmf_data =
    '{"FV":"1.0","GI":"KEBA_KCP30","GS":"27644804","GV":"2.8.6","PG":"T145","IS":true,"IL":"TRUSTED","IF":["RFID_PLAIN","OCPP_AUTH","ISO15118_NONE","PLMN_NONE"],"IT":"ISO14443","ID":"AA64BEE4","RD":[{"TM":"' +
    formattedStart +
    ' I","TX":"B","EF":"","ST":"G","RV": ' +
      meterValueStart +
    ',"RI":"1-b:1.8.e","RU":"Wh"}]}';

  if (meterValueEnd !== undefined && endTimestamp !== undefined) {
    const formattedStop = formatTimestampPlus2Hours(endTimestamp);

    raw_ocmf_data =
      '{"FV":"1.0","GI":"KEBA_KCP30","GS":"27644804","GV":"2.8.6","PG":"T145","IS":true,"IL":"TRUSTED","IF":["RFID_PLAIN","OCPP_AUTH","ISO15118_NONE","PLMN_NONE"],"IT":"ISO14443","ID":"AA64BEE4","RD":[{"TM":"' +
      formattedStart +
      ' I","TX":"B","EF":"","ST":"G","RV": ' +
      meterValueStart +
      ',"RI":"1-b:1.8.e","RU":"Wh"},{"TM":"' +
      formattedStop +
      ' I","TX":"E","EF":"","ST":"G","RV": ' +
      meterValueEnd +
      ',"RI":"1-b:1.8.e","RU":"Wh"}]}';
  }

  return raw_ocmf_data;
}

async function importPrivateKeyFromPkcs8Hex(derHex) {
  const keyData = hexToArrayBuffer(derHex);
  const pkcs8Der = sec1ToPkcs8(keyData);

  return await window.crypto.subtle.importKey(
    "pkcs8",
    pkcs8Der,
    {
      name: "ECDSA",
      namedCurve: "P-256", // SECP256R1
    },
    false,
    ["sign"]
  );
}

function hexToArrayBuffer(hex) {
  if (hex.length % 2 !== 0) {
    throw new Error("Invalid hex string");
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes.buffer;
}

function arrayBufferToHex(buffer) {
  const bytes = new Uint8Array(buffer);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    const h = bytes[i].toString(16).padStart(2, "0");
    hex += h;
  }
  return hex;
}

function encodeLength(len) {
  if (len < 128) return [len];
  const bytes = [];
  while (len > 0) {
    bytes.unshift(len & 0xff);
    len >>= 8;
  }
  return [0x80 | bytes.length, ...bytes];
}

export function sec1ToPkcs8(sec1Der) {
  const sec1 = new Uint8Array(sec1Der);

  let offset = 0;

  if (sec1[offset] !== 0x30) throw new Error("Not a SEQUENCE");
  offset++;

  let len = sec1[offset++];
  if (len & 0x80) {
    const n = len & 0x7f;
    len = 0;
    for (let i = 0; i < n; i++) len = (len << 8) | sec1[offset++];
  }

  if (sec1[offset++] !== 0x02 || sec1[offset++] !== 0x01)
    throw new Error("Missing EC version");
  if (sec1[offset++] !== 0x01) throw new Error("Wrong EC version");

  if (sec1[offset++] !== 0x04) throw new Error("Missing private key");
  const pkLen = sec1[offset++];
  const privateKey = sec1.slice(offset, offset + pkLen);
  offset += pkLen;

  let curveOid = null;
  let publicKey = null;

  // [0] parameters
  if (sec1[offset] === 0xa0) {
    offset++;
    const len = sec1[offset++];
    curveOid = sec1.slice(offset, offset + len);
    offset += len;
  }

  // [1] public key
  if (sec1[offset] === 0xa1) {
    offset++;
    const len = sec1[offset++];
    publicKey = sec1.slice(offset, offset + len);
    offset += len;
  }

  // ECPrivateKey
  const ecPriv = [];

  ecPriv.push(0x30);
  const ecInner = [
    0x02,
    0x01,
    0x01,
    0x04,
    privateKey.length,
    ...privateKey,
    ...(curveOid ? [0xa0, curveOid.length, ...curveOid] : []),
    ...(publicKey ? [0xa1, publicKey.length, ...publicKey] : []),
  ];
  ecPriv.push(...encodeLength(ecInner.length));
  ecPriv.push(...ecInner);

  const algo = [
    0x30, 0x13, 0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01, 0x06,
    0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07,
  ];

  const body = [
    0x02,
    0x01,
    0x00, // version
    ...algo,
    0x04,
    ...encodeLength(ecPriv.length),
    ...ecPriv,
  ];

  const top = [0x30, ...encodeLength(body.length), ...body];

  return new Uint8Array(top).buffer;
}

function rawSigToDer(raw) {
  const sig = new Uint8Array(raw);
  const r = sig.slice(0, 32);
  const s = sig.slice(32);

  function trimLeadingZeros(buf) {
    let i = 0;
    while (i < buf.length - 1 && buf[i] === 0) i++;
    return buf.slice(i);
  }

  let rT = trimLeadingZeros(r);
  let sT = trimLeadingZeros(s);

  if (rT[0] & 0x80) rT = Uint8Array.from([0, ...rT]);
  if (sT[0] & 0x80) sT = Uint8Array.from([0, ...sT]);

  const der = [
    0x30,
    4 + rT.length + sT.length,
    0x02,
    rT.length,
    ...rT,
    0x02,
    sT.length,
    ...sT,
  ];

  return new Uint8Array(der);
}
