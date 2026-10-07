// @vitest-environment node
import { expect, it } from "vitest";
import { encodeSymbol, segmentsFor } from "../../test/encoders/qr";
import { decodeQrMatrix } from "../qr/decode-matrix";
import { BitMatrix } from "../qr/layout";
import { SAMPLE_QR, sampleImage } from "./samples";

it("is the QR of the web-kit address, version 4-M, as the test encoder makes it", () => {
  const encoded = encodeSymbol("qr", 4, "M", segmentsFor(SAMPLE_QR.text))!;
  expect([SAMPLE_QR.size, SAMPLE_QR.rows.length, encoded.mask]).toEqual([33, 33, 2]);
  for (let y = 0; y < 33; y++) expect([y, SAMPLE_QR.rows[y]]).toEqual([y, [...Array(33)].map((_, x) => (encoded.matrix.get(x, y) ? "1" : "0")).join("")]);
  const matrix = new BitMatrix(33, 33);
  for (let y = 0; y < 33; y++) for (let x = 0; x < 33; x++) matrix.set(x, y, SAMPLE_QR.rows[y]![x] === "1");
  expect(decodeQrMatrix(matrix)?.text).toBe(SAMPLE_QR.text);
  const image = sampleImage(8, 4);
  expect([image.width, image.height, image.format, image.data[0], image.data[(4 * 8 * image.width + 4 * 8) * 4]]).toEqual([328, 328, "rgba", 255, 0]);
});
