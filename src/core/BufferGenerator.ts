export class BufferGenerator {
  private view: DataView;
  private uint8: Uint8Array;

  constructor(byteLength: number) {
    const buffer = new ArrayBuffer(byteLength);
    this.view = new DataView(buffer);
    this.uint8 = new Uint8Array(buffer);
  }

  private assertBounds(offset: number, size: number): void {
    if (offset + size > this.view.byteLength) {
      throw new RangeError(
        `BufferGenerator: out of bounds write at offset ${offset} (size ${size}, buffer ${this.view.byteLength})`
      );
    }
  }

  writeUint8(offset: number, value: number): void {
    this.assertBounds(offset, 1);
    this.view.setUint8(offset, value);
  }

  writeUint16LE(offset: number, value: number): void {
    this.assertBounds(offset, 2);
    this.view.setUint16(offset, value, true);
  }

  writeUint32LE(offset: number, value: number): void {
    this.assertBounds(offset, 4);
    this.view.setUint32(offset, value, true);
  }

  writeFloat32LE(offset: number, value: number): void {
    this.assertBounds(offset, 4);
    this.view.setFloat32(offset, value, true);
  }

  writeAscii(offset: number, value: string, fieldLength: number): void {
    this.assertBounds(offset, fieldLength);
    for (let i = 0; i < fieldLength; i++) {
      this.view.setUint8(offset + i, i < value.length ? value.charCodeAt(i) : 0);
    }
  }

  writeBytes(offset: number, bytes: Uint8Array): void {
    this.assertBounds(offset, bytes.byteLength);
    this.uint8.set(bytes, offset);
  }

  toUint8Array(): Uint8Array {
    return new Uint8Array(this.uint8);
  }

  toArrayBuffer(): ArrayBuffer {
    return this.uint8.buffer.slice(0) as ArrayBuffer;
  }
}
