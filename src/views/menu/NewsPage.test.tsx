import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RELEASES } from "../../copy/novedades";
import { NewsPage } from "./NewsPage";

describe("Novedades", () => {
  it("se abre con la versión instalada y solo queda una abierta a la vez", () => {
    render(<NewsPage version={RELEASES[0].version} />);
    expect(screen.getByText(`• ${RELEASES[0].changes[0]}`)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: new RegExp(`Versión ${RELEASES[1].version} ·`) }));
    expect(screen.getByText(`• ${RELEASES[1].changes[0]}`)).toBeInTheDocument();
    expect(screen.queryByText(`• ${RELEASES[0].changes[0]}`)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: new RegExp(`Versión ${RELEASES[2].version} ·`) }));
    expect(screen.queryByText(`• ${RELEASES[1].changes[0]}`)).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { expanded: true })).toHaveLength(1);

    // Volver a tocar la abierta la pliega.
    fireEvent.click(screen.getByRole("button", { name: new RegExp(`Versión ${RELEASES[2].version} ·`) }));
    expect(screen.queryAllByRole("button", { expanded: true })).toHaveLength(0);
  });
});
