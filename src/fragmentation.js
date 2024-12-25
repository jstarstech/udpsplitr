import crypto from "crypto";

// Function to fragment a message into smaller packets with unique ID and sequence number
export function fragmentMessage(msg, mtuSize) {
  const fragments = [];
  const id = crypto.randomBytes(4).toString("hex");
  for (let i = 0; i < msg.length; i += mtuSize) {
    const fragmentSize = Math.min(mtuSize, msg.length - i);
    const fragment = Buffer.alloc(fragmentSize + 9);
    fragment.write(id, 0, 4, "hex");
    fragment.writeUInt32BE(i / mtuSize, 4);
    fragment.writeUInt8(1, 8); // Mark as fragment
    msg.copy(fragment, 9, i, i + fragmentSize);
    fragments.push(fragment);
  }
  return fragments;
}

// Function to reassemble fragments into a complete message
export function reassembleMessage(fragments) {
  fragments.sort((a, b) => a.readUInt32BE(4) - b.readUInt32BE(4));
  const buffers = fragments.map((fragment) => fragment.slice(9));
  return Buffer.concat(buffers);
}
