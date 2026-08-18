export type DriveFolderCreationSession =
  | { readonly status: "idle" }
  | { readonly name: string; readonly status: "editing" }
  | { readonly name: string; readonly status: "submitting" };

export const idleDriveFolderCreationSession: DriveFolderCreationSession = { status: "idle" };

export function beginDriveFolderCreation(defaultName = "新建文件夹"): DriveFolderCreationSession {
  const name = defaultName.trim() || "新建文件夹";
  return { name, status: "editing" };
}

export function updateDriveFolderCreationName(
  session: DriveFolderCreationSession,
  name: string,
): DriveFolderCreationSession {
  if (session.status === "idle") return session;
  return { name, status: session.status };
}

export function driveFolderCreationCanSubmit(session: DriveFolderCreationSession) {
  return session.status === "editing" && session.name.trim().length > 0;
}

export function prepareDriveFolderCreationSubmission(session: DriveFolderCreationSession) {
  if (session.status !== "editing") return null;
  if (!driveFolderCreationCanSubmit(session)) return null;
  const name = session.name.trim();
  return {
    name,
    session: { name, status: "submitting" } satisfies DriveFolderCreationSession,
  };
}

export function finishDriveFolderCreation(): DriveFolderCreationSession {
  return idleDriveFolderCreationSession;
}

export function failDriveFolderCreation(session: DriveFolderCreationSession): DriveFolderCreationSession {
  if (session.status !== "submitting") return session;
  return { name: session.name, status: "editing" };
}
