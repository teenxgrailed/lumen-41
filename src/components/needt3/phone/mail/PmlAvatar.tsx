import { initials } from "../../mail/derive";
import { pkCx } from "../kit";

export function PmlAvatar({ name, big }: { name: string; big?: boolean }) {
  return (
    <span className={pkCx("pml-avatar", big && "is-big")} aria-hidden="true">
      {initials(name)}
    </span>
  );
}
