export function truncateAddress(address: string | null, start = 4, end = 4): string {
  if (!address) return "";
  if (address.length <= start + end + 2) return address;
  return `${address.slice(0, start + 2)}...${address.slice(-end)}`;
}
