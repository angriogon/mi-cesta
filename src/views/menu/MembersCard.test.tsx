import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { localAccount, type Account, type HouseholdMember, type Permission } from "../../app/account";
import { MembersCard } from "./MembersCard";

const members: HouseholdMember[] = [
  { userId: "ana", email: "ana@x.es", role: "owner", permissions: ["almacen", "mascota", "miembros"] },
  { userId: "luis", email: "luis@x.es", role: "member", permissions: [] },
];

function account(permissions: Permission[]): Account {
  return {
    ...localAccount(),
    mode: "supabase",
    email: "ana@x.es",
    role: "owner",
    permissions,
    can: (permission) => permissions.includes(permission),
    members: vi.fn(() => Promise.resolve(members.map((member) => ({ ...member })))),
    setMemberPermissions: vi.fn(() => Promise.resolve()),
    removeMember: vi.fn(() => Promise.resolve()),
  };
}

describe("miembros del hogar", () => {
  it("con el permiso «miembros» se dan permisos y se quita a alguien con doble toque", async () => {
    const owner = account(["almacen", "mascota", "miembros"]);
    const messages: string[] = [];
    render(<MembersCard account={owner} onMessage={(message) => messages.push(message)} />);
    expect(await screen.findByText("Miembro · uso diario")).toBeInTheDocument();
    // A uno mismo y al responsable no se les puede abrir.
    expect(screen.getByRole("button", { name: /ana@x\.es \(tú\)/ })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: /luis@x\.es/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Mascota/ }));
    await waitFor(() => expect(owner.setMemberPermissions).toHaveBeenCalledWith("luis", ["mascota"]));
    expect(await screen.findByText("Miembro · Mascota")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Quitar del hogar" }));
    expect(owner.removeMember).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Toca otra vez para quitarle del hogar" }));
    await waitFor(() => expect(owner.removeMember).toHaveBeenCalledWith("luis"));
    expect(screen.queryByText(/luis@x\.es/)).not.toBeInTheDocument();
    expect(messages).toContain("luis@x.es ya no forma parte del hogar.");
  });

  it("sin ese permiso solo se ve quién está y qué puede hacer", async () => {
    render(<MembersCard account={account([])} onMessage={vi.fn()} />);
    expect(await screen.findByText("Responsable · todos los permisos")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /luis@x\.es/ })).toBeDisabled();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });
});
