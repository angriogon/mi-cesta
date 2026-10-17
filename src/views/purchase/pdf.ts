import type { Grouped } from "./types";
import { todayIso } from "../../lib/text";

export async function sharePdf(grouped: Grouped) {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF();
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(20);
  pdf.text("Lista de la compra", 18, 22);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  pdf.setTextColor(95, 107, 98);
  pdf.text(new Intl.DateTimeFormat("es-ES", { dateStyle: "long" }).format(new Date()), 18, 30);
  let y = 43;
  for (const group of grouped) {
    const pending = group.items.filter((item) => !item.done);
    if (!pending.length) continue;
    if (y > 265) {
      pdf.addPage();
      y = 20;
    }
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(11);
    pdf.setTextColor(41, 91, 63);
    pdf.text(group.category.toUpperCase(), 18, y);
    y += 8;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(12);
    pdf.setTextColor(27, 34, 29);
    for (const item of pending) {
      if (y > 278) {
        pdf.addPage();
        y = 20;
      }
      pdf.rect(19, y - 3.5, 4, 4);
      pdf.text(`${item.quantity} × ${item.name}`, 28, y);
      y += 8;
    }
    y += 3;
  }
  const filename = `cesta-${todayIso()}.pdf`;
  const file = new File([pdf.output("blob")], filename, { type: "application/pdf" });
  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: "Lista de la compra" });
    } catch (error) {
      if ((error as DOMException)?.name !== "AbortError") pdf.save(filename);
    }
  } else pdf.save(filename);
}
