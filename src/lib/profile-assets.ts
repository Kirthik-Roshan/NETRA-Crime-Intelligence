const PUBLIC_BASE_PATH = process.env.NEXT_PUBLIC_CATALYST_WEB_CLIENT === "true" ? "/app" : "";

export const SYNTHETIC_PROFILE_NOTICE = "Fictional synthetic identity image";

export function syntheticProfileImage(profileId: number | string | null | undefined): string {
  const id = Number(profileId);
  if (!Number.isSafeInteger(id) || id <= 0) return "";
  return `${PUBLIC_BASE_PATH}/synthetic-profiles/profile-${String(id).padStart(6, "0")}.webp`;
}

export function syntheticProfileKey(profileId: number | string | null | undefined): string {
  const id = Number(profileId);
  if (!Number.isSafeInteger(id) || id <= 0) return "";
  return `synthetic-accused-profiles/v1/profile-${String(id).padStart(6, "0")}.webp`;
}

