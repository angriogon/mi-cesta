// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readBarcodes, writeBarcode, type WriterOptions } from "zxing-wasm/full";
import { acceptRead } from "../views/scanner/useBarcodeCamera";
import { readerOptions } from "./barcode-reader";

/** Dibuja el código con el mismo motor y lo lee con las opciones del escáner. */
async function scan(text: string, format: WriterOptions["format"], options = "") {
  const written = await writeBarcode(text, { format, scale: 3, options });
  const image = new Uint8Array(await written.image!.arrayBuffer());
  const reads = (await readBarcodes(image, readerOptions(true)))
    .filter((result) => result.isValid)
    .map((result) => ({ text: result.text, format: result.format }));
  return acceptRead(reads, "").parsed;
}

describe("lector de códigos (ZXing C++ en WebAssembly)", () => {
  it("lee EAN-13, EAN-8 (Lidl, Aldi), UPC-A y UPC-E", async () => {
    expect((await scan("8480000160270", "EAN13"))?.code).toBe("8480000160270");
    expect(await scan("20018177", "EAN8")).toMatchObject({ code: "20018177", kind: "interno" });
    expect((await scan("036000291452", "UPCA"))?.code).toBe("0036000291452");
    expect((await scan("04252614", "UPCE"))?.code).toBe("0042100005264");
  });

  it("lee el ITF-14 de un pack y busca la unidad", async () => {
    expect((await scan("18410000000006", "ITF14"))?.code).toBe("8410000000009");
  });

  it("lee GS1-128 y GS1 DataBar Expanded con peso y precio", async () => {
    const data = "(01)08410000000009(3103)000750(3922)00599";
    const expected = { code: "8410000000009", weightGrams: 750, priceCents: 599 };
    expect(await scan(data, "Code128", "gs1")).toMatchObject(expected);
    expect(await scan(data, "DataBarExp", "gs1")).toMatchObject(expected);
  });

  it("lee el QR GS1 Digital Link; un QR cualquiera no", async () => {
    expect((await scan("https://id.gs1.org/01/08410000000009", "QRCode"))?.code).toBe("8410000000009");
    expect(await scan("https://example.com/promo", "QRCode")).toBeNull();
  });

  it("un Code 128 interno (sin dígito de control) tiene que salir igual dos veces", () => {
    const read = [{ text: "123456789", format: "Code128" }];
    expect(acceptRead(read, "").parsed).toBeNull();
    expect(acceptRead(read, "123456789").parsed).toMatchObject({ code: "123456789", kind: "interno" });
  });

  it("una etiqueta de la balanza se reconoce por su artículo", async () => {
    expect(await scan("2300540012500", "EAN13")).toMatchObject({ kind: "peso-variable", itemKey: "peso:2300540" });
  });
});
