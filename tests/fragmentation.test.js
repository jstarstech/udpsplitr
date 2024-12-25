import { fragmentMessage, reassembleMessage } from "../src/fragmentation.js";

describe("fragmentMessage", () => {
  test("should fragment a message into smaller packets", () => {
    const msg = Buffer.from("This is a test message that needs to be fragmented.");
    const mtuSize = 10;
    const fragments = fragmentMessage(msg, mtuSize);

    expect(fragments.length).toBeGreaterThan(1);
    fragments.forEach((fragment, index) => {
      const id = fragment.toString("hex", 0, 4);
      const sequenceNumber = fragment.readUInt32BE(4);
      const isFragment = fragment.readUInt8(8) === 1;
      const data = fragment.slice(9);

      expect(id.length).toBe(8);
      expect(sequenceNumber).toBe(index);
      expect(isFragment).toBe(true);
      expect(data.length).toBeLessThanOrEqual(mtuSize);
    });
  });
});

describe("reassembleMessage", () => {
  test("should reassemble fragments into a complete message", () => {
    const msg = Buffer.from("This is a test message that needs to be fragmented.");
    const mtuSize = 10;
    const fragments = fragmentMessage(msg, mtuSize);
    const reassembledMsg = reassembleMessage(fragments);

    expect(reassembledMsg.toString()).toBe(msg.toString());
  });
});
