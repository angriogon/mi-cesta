import { describe, expect, it } from "vitest";
import { expandUpcE, gtinCheckDigit, isValidGtin, lookupCodes, parseScannedCode } from "./barcode";
import { storeForBrand } from "./stores";

describe("códigos de barras", () => {
  it("comprueba el dígito de control de EAN-13, EAN-8, UPC-A e ITF-14", () => {
    expect(gtinCheckDigit("841000000000")).toBe(9);
    expect(isValidGtin("8410000000009")).toBe(true);
    expect(isValidGtin("8410000000001")).toBe(false);
    expect(isValidGtin("20018177")).toBe(true); // EAN-8 de Lidl
    expect(isValidGtin("036000291452")).toBe(true); // UPC-A
    expect(isValidGtin("18410000000006")).toBe(true); // ITF-14
  });

  it("EAN-13 normal de cualquier súper", () => {
    expect(parseScannedCode("8480000160270", "EAN13")).toMatchObject({ code: "8480000160270", kind: "producto" });
    expect(parseScannedCode("8480000160271", "EAN13")).toBeNull();
  });

  it("UPC-A y UPC-E se buscan como EAN-13 y en su forma original", () => {
    expect(lookupCodes(parseScannedCode("036000291452", "UPCA")!)).toEqual(["0036000291452", "036000291452"]);
    expect(expandUpcE("04252614")).toBe("042100005264");
    expect(lookupCodes(parseScannedCode("04252614", "UPCE")!)).toEqual(["0042100005264", "042100005264", "04252614"]);
  });

  it("ITF-14 de un pack: se busca la unidad que contiene", () => {
    const pack = parseScannedCode("18410000000006", "ITF14");
    expect(pack?.code).toBe("8410000000009");
    expect(pack?.alternatives).toContain("18410000000006");
    expect(parseScannedCode("08410000000009", "ITF14")?.code).toBe("8410000000009");
  });

  it("etiqueta de la balanza: recuerda el artículo, no el importe", () => {
    const a = parseScannedCode("2300540012500", "EAN13");
    const b = parseScannedCode(`230054003450${gtinCheckDigit("230054003450")}`, "EAN13");
    expect(a).toMatchObject({ kind: "peso-variable", itemKey: "peso:2300540" });
    expect(b?.itemKey).toBe(a?.itemKey);
  });

  it("EAN-8 internos de las cadenas (Lidl, Aldi)", () => {
    expect(parseScannedCode("20018177", "EAN8")).toMatchObject({ code: "20018177", kind: "interno" });
  });

  it("GS1 DataBar y GS1-128: GTIN, peso y precio", () => {
    expect(parseScannedCode("(01)08410000000009(3103)000750(3922)00599", "DataBarExp")).toMatchObject({
      code: "8410000000009",
      weightGrams: 750,
      priceCents: 599,
    });
    expect(parseScannedCode("(01)08410000000009", "DataBar")?.code).toBe("8410000000009");
    expect(parseScannedCode("(10)LOTE1", "Code128")).toBeNull();
  });

  it("QR GS1 Digital Link sí; otros QR no", () => {
    expect(parseScannedCode("https://id.gs1.org/01/08410000000009/10/ABC", "QRCode")?.code).toBe("8410000000009");
    expect(parseScannedCode("https://example.com/promo", "QRCode")).toBeNull();
  });

  it("escrito a mano: con espacios, y códigos internos sin control GS1", () => {
    expect(parseScannedCode(" 8410 0000 00009 ")?.code).toBe("8410000000009");
    expect(parseScannedCode("123456789")).toMatchObject({ kind: "interno" });
    expect(parseScannedCode("1234567")).toBeNull();
  });
});

describe("marcas propias", () => {
  it("dice de qué cadena es cada marca", () => {
    expect(storeForBrand("Hacendado")).toBe("Mercadona");
    expect(storeForBrand("DIA%")).toBe("DIA");
    expect(storeForBrand("Milbona, Lidl")).toBe("Lidl");
    expect(storeForBrand("Milsani")).toBe("Aldi");
    expect(storeForBrand("Eroski Natur")).toBe("Eroski");
    expect(storeForBrand("Consum")).toBe("Consum");
    expect(storeForBrand("Carrefour Bio")).toBe("Carrefour o Supeco");
    expect(storeForBrand("Auchan")).toBe("Alcampo");
    expect(storeForBrand("Danone")).toBeNull();
    expect(storeForBrand("")).toBeNull();
  });
});
