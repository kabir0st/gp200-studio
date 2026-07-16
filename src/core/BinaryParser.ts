export class BinaryParser {
  private view: DataView;

  constructor(buffer: Uint8Array) {
    this.view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  }

  private assertBounds(offset: number, size: number): void {
    if (offset + size > this.view.byteLength) {
      throw new RangeError(
        `BinaryParser: out of bounds read at offset ${offset} (size ${size}, buffer ${this.view.byteLength})`
      );
    }
  }

  readUint8(offset: number): number {
    this.assertBounds(offset, 1);
    return this.view.getUint8(offset);
  }

  readUint16LE(offset: number): number {
    this.assertBounds(offset, 2);
    return this.view.getUint16(offset, true);
  }

  readUint16BE(offset: number): number {
    this.assertBounds(offset, 2);
    return this.view.getUint16(offset, false);
  }

  readUint32LE(offset: number): number {
    this.assertBounds(offset, 4);
    return this.view.getUint32(offset, true);
  }

  readFloat32LE(offset: number): number {
    this.assertBounds(offset, 4);
    return this.view.getFloat32(offset, true);
  }

  readBytes(offset: number, length: number): number[] {
    this.assertBounds(offset, length);
    const result: number[] = [];
    for (let i = 0; i < length; i++) {
      result.push(this.view.getUint8(offset + i));
    }
    return result;
  }

  readAscii(offset: number, length: number): string {
    this.assertBounds(offset, length);
    let result = '';
    for (let i = 0; i < length; i++) {
      const byte = this.view.getUint8(offset + i);
      if (byte === 0) break; // null-terminated
      result += String.fromCharCode(byte);
    }
    return result;
  }

  get byteLength(): number {
    return this.view.byteLength;
  }
}
