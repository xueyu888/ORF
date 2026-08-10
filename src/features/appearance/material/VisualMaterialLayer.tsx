import { clsx } from "clsx";
import { materialCssVariables, type AdaptiveMaterial, type PersistentMaterialRole } from "./materialTokens";

export function VisualMaterialLayer({
  className,
  material,
  role,
}: {
  className?: string;
  material: AdaptiveMaterial;
  role: PersistentMaterialRole;
}) {
  return (
    <span
      className={clsx("orf-adaptive-material-layer", className)}
      data-material-content-tone={material.contentTone}
      data-material-blur={material.blurRadius <= 0 ? "none" : "active"}
      data-material-role={role}
      data-material-transparency={material.transparency}
      style={materialCssVariables(material)}
      aria-hidden="true"
    />
  );
}
