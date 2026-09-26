/*
 * The formats that are checked. Each rule follows the RFC named next to it; anything
 * that is not clearly valid is rejected. Other formats are not checked and give a warning.
 */

const IPV4_PART = "(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])";
const IPV4 = new RegExp(`^${IPV4_PART}(?:\\.${IPV4_PART}){3}$`);
const HEX_GROUP = /^[0-9A-Fa-f]{1,4}$/;
const UUID = /^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$/;
const DATE = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/;
const TIME = /^([0-9]{2}):([0-9]{2}):([0-9]{2})(?:\.[0-9]+)?(?:[Zz]|([+-])([0-9]{2}):([0-9]{2}))$/;
const DOT_ATOM = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/;
const QUOTED = /^"(?:[\x20\x21\x23-\x5b\x5d-\x7e]|\\[\x20-\x7e])*"$/;
const LABEL = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/;
const PCT = "%[0-9A-Fa-f]{2}";
const SUB_DELIMS = "!$&'()*+,;=";
const PCHAR = `(?:[A-Za-z0-9\\-._~${SUB_DELIMS}:@]|${PCT})`;
const URI = new RegExp(
  "^[A-Za-z][A-Za-z0-9+.-]*:" +
    `(?://((?:[A-Za-z0-9\\-._~${SUB_DELIMS}:]|${PCT})*@)?(\\[[^\\]]*\\]|(?:[A-Za-z0-9\\-._~${SUB_DELIMS}]|${PCT})*)(?::[0-9]*)?(?:/${PCHAR}*)*` +
    `|/?(?:${PCHAR}+(?:/${PCHAR}*)*)?)` +
    `(?:\\?(?:${PCHAR}|[/?])*)?(?:#(?:${PCHAR}|[/?])*)?$`,
);
const IP_FUTURE = new RegExp(`^[vV][0-9A-Fa-f]+\\.(?:[A-Za-z0-9\\-._~${SUB_DELIMS}:])+$`);

// The date parts are at most four digits, so Number() is exact here.
function daysIn(year: number, month: number): number {
  if (month === 2) return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/** RFC 3339 full-date. */
function isDate(text: string): boolean {
  const match = DATE.exec(text);
  if (!match) return false;
  const month = Number(match[2]);
  const day = Number(match[3]);
  return month >= 1 && month <= 12 && day >= 1 && day <= daysIn(Number(match[1]), month);
}

/** RFC 3339 date-time; a leap second is allowed only at 23:59:60 UTC. */
function isDateTime(text: string): boolean {
  const t = text.search(/[Tt]/);
  if (t !== 10 || !isDate(text.slice(0, 10))) return false;
  const match = TIME.exec(text.slice(11));
  if (!match) return false;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3]);
  const offsetHour = match[5] === undefined ? 0 : Number(match[5]);
  const offsetMinute = match[6] === undefined ? 0 : Number(match[6]);
  if (hour > 23 || minute > 59 || second > 60 || offsetHour > 23 || offsetMinute > 59) return false;
  if (second < 60) return true;
  const sign = match[4] === "-" ? -1 : 1;
  const utc = (((hour * 60 + minute - sign * (offsetHour * 60 + offsetMinute)) % 1440) + 1440) % 1440;
  return utc === 23 * 60 + 59;
}

/** RFC 4291 text form, without a zone. The last part may be an IPv4 address. */
function isIpv6(text: string): boolean {
  const halves = text.split("::");
  if (halves.length > 2) return false;
  let groups = 0;
  for (let h = 0; h < halves.length; h++) {
    const half = halves[h]!;
    if (half === "") continue;
    const parts = half.split(":");
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]!;
      if (h === halves.length - 1 && i === parts.length - 1 && part.includes(".")) {
        if (!IPV4.test(part)) return false;
        groups += 2;
      } else if (HEX_GROUP.test(part)) groups += 1;
      else return false;
    }
  }
  return halves.length === 2 ? groups <= 7 : groups === 8;
}

/** RFC 1123 host name: dot-separated labels of letters, digits and inner hyphens. */
function isHostname(text: string): boolean {
  return text.length <= 253 && text.split(".").every((label) => LABEL.test(label));
}

/** RFC 5321 mailbox: dot-atom or quoted local part; host name or address literal. */
function isEmail(text: string): boolean {
  const at = text.lastIndexOf("@");
  if (at <= 0) return false;
  const local = text.slice(0, at);
  const domain = text.slice(at + 1);
  if (!DOT_ATOM.test(local) && !QUOTED.test(local)) return false;
  if (domain.startsWith("[") && domain.endsWith("]")) {
    const literal = domain.slice(1, -1);
    return /^IPv6:/i.test(literal) ? isIpv6(literal.slice(5)) : IPV4.test(literal);
  }
  return isHostname(domain);
}

/** RFC 3986 absolute URI (with a scheme), ASCII only. */
function isUri(text: string): boolean {
  const match = URI.exec(text);
  if (!match) return false;
  const host = match[2];
  if (host?.startsWith("[")) {
    const literal = host.slice(1, -1);
    return isIpv6(literal) || IP_FUTURE.test(literal);
  }
  return true;
}

export interface FormatRule {
  test: (text: string) => boolean;
  /** Shown when a string does not match. */
  message: string;
}

export const FORMATS: ReadonlyMap<string, FormatRule> = new Map([
  ["email", { test: isEmail, message: "Expected an email address" }],
  ["uri", { test: isUri, message: "Expected an absolute URI" }],
  ["date", { test: isDate, message: "Expected a date like 2024-01-31" }],
  ["date-time", { test: isDateTime, message: "Expected a date-time like 2024-01-31T12:00:00Z" }],
  ["uuid", { test: (text) => UUID.test(text), message: "Expected a UUID" }],
  ["ipv4", { test: (text) => IPV4.test(text), message: "Expected an IPv4 address" }],
  ["ipv6", { test: isIpv6, message: "Expected an IPv6 address" }],
]);
