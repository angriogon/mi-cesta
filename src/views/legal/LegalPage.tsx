import { useState } from "react";
import { LEGAL_DOCUMENTS, LEGAL_UPDATED, type LegalDocument } from "../../copy/legal";

/** Privacidad, condiciones y cookies, con un control segmentado para cambiar de documento. */
export function LegalPage({ initial = "privacy" }: { initial?: LegalDocument["id"] }) {
  const [id, setId] = useState<LegalDocument["id"]>(initial);
  const document = LEGAL_DOCUMENTS.find((item) => item.id === id) ?? LEGAL_DOCUMENTS[0];
  return (
    <section>
      <div className="flex rounded-xl bg-muted p-1" role="group" aria-label="Documento legal">
        {LEGAL_DOCUMENTS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setId(item.id)}
            aria-pressed={item.id === id}
            className={`min-h-8 flex-1 rounded-[7px] px-2 text-[0.8125rem] text-foreground ${item.id === id ? "bg-thumb font-semibold shadow-thumb" : "font-medium"}`}
          >
            {item.id === "privacy" ? "Privacidad" : item.id === "terms" ? "Condiciones" : "Cookies"}
          </button>
        ))}
      </div>
      <article className="mt-4">
        <h2 className="text-lg font-semibold">{document.title}</h2>
        <p className="mt-1 text-xs text-muted-foreground">Actualizado el {LEGAL_UPDATED}</p>
        {document.sections.map((section) => (
          <div key={section.heading} className="mt-4 rounded-xl bg-card p-4">
            <h3 className="text-sm font-semibold">{section.heading}</h3>
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph} className="mt-2 text-xs leading-5 text-muted-foreground">
                {paragraph}
              </p>
            ))}
          </div>
        ))}
      </article>
    </section>
  );
}
