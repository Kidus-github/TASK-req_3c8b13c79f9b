const EPOCH_OFFSET = new Date('2000-01-01').getTime();
const MS_PER_DAY = 86_400_000;

export function dateToEpochDay(dateStr: string): number {
  const [year, month, day] = dateStr.split('-').map(Number);
  const d = new Date(year, month - 1, day);
  return Math.floor((d.getTime() - EPOCH_OFFSET) / MS_PER_DAY);
}

export function getLocalDateString(timestamp?: number): string {
  const d = timestamp ? new Date(timestamp) : new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function computeOrbitalDistance(
  dateStr: string,
  minDate: string,
  maxDate: string,
  baseRadius: number = 2,
  maxOrbitalRadius: number = 10
): number {
  const epochDay = dateToEpochDay(dateStr);
  const minDay = dateToEpochDay(minDate);
  const maxDay = dateToEpochDay(maxDate);

  if (minDay === maxDay) {
    return baseRadius + maxOrbitalRadius / 2;
  }

  const normalized = (epochDay - minDay) / (maxDay - minDay);
  return baseRadius + normalized * maxOrbitalRadius;
}

export function getTodayLocalDate(): string {
  return getLocalDateString();
}

export function isYesterday(dateStr: string, todayStr: string): boolean {
  const todayEpoch = dateToEpochDay(todayStr);
  const dateEpoch = dateToEpochDay(dateStr);
  return todayEpoch - dateEpoch === 1;
}
