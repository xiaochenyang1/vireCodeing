const SHANGHAI_TIME_OFFSET_MS = 8 * 60 * 60 * 1000;

export function formatPlatformIsoMinute(value: string) {
  const timestamp = Date.parse(value);

  if (Number.isNaN(timestamp)) {
    return value.slice(0, 16).replace('T', ' ');
  }

  const shanghaiTime = new Date(timestamp + SHANGHAI_TIME_OFFSET_MS);
  const year = shanghaiTime.getUTCFullYear();
  const month = `${shanghaiTime.getUTCMonth() + 1}`.padStart(2, '0');
  const day = `${shanghaiTime.getUTCDate()}`.padStart(2, '0');
  const hours = `${shanghaiTime.getUTCHours()}`.padStart(2, '0');
  const minutes = `${shanghaiTime.getUTCMinutes()}`.padStart(2, '0');

  return `${year}-${month}-${day} ${hours}:${minutes}`;
}
