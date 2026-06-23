export type OrfAuthSessionPolicy = {
  durationDays: number;
  maxAgeSeconds: number;
  oryLifespan: string;
};

const HOURS_PER_DAY = 24;
const SECONDS_PER_HOUR = 60 * 60;

export const ORY_SESSION_LIFESPAN_ENV_NAME = "SESSION_LIFESPAN";

export const ORF_AUTH_SESSION_POLICY = Object.freeze({
  durationDays: 7,
  maxAgeSeconds: 7 * HOURS_PER_DAY * SECONDS_PER_HOUR,
  oryLifespan: "168h",
} satisfies OrfAuthSessionPolicy);
