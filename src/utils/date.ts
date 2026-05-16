export function localDateString(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function addCalendarDays(value: string, days: number, invalidFallback = "") {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return invalidFallback;
  date.setDate(date.getDate() + days);
  return localDateString(date);
}
