import type { Group } from '../../shared/types';

// Only the flags our maps use get bundled (the full flag set is ~450 KB of CSS).
const FLAG_FILES = import.meta.glob(
  [
    '/node_modules/flag-icons/flags/1x1/eg.svg',
    '/node_modules/flag-icons/flags/1x1/tr.svg',
    '/node_modules/flag-icons/flags/1x1/it.svg',
    '/node_modules/flag-icons/flags/1x1/de.svg',
    '/node_modules/flag-icons/flags/1x1/cn.svg',
    '/node_modules/flag-icons/flags/1x1/gb.svg',
    '/node_modules/flag-icons/flags/1x1/jp.svg',
    '/node_modules/flag-icons/flags/1x1/us.svg',
    '/node_modules/flag-icons/flags/1x1/pt.svg',
    '/node_modules/flag-icons/flags/1x1/gr.svg',
    '/node_modules/flag-icons/flags/1x1/nl.svg',
    '/node_modules/flag-icons/flags/1x1/es.svg',
    '/node_modules/flag-icons/flags/1x1/ch.svg',
    '/node_modules/flag-icons/flags/1x1/se.svg',
    '/node_modules/flag-icons/flags/1x1/no.svg',
    '/node_modules/flag-icons/flags/1x1/fr.svg',
    '/node_modules/flag-icons/flags/1x1/br.svg',
    '/node_modules/flag-icons/flags/1x1/in.svg',
    '/node_modules/flag-icons/flags/1x1/au.svg',
    '/node_modules/flag-icons/flags/1x1/ae.svg',
    '/node_modules/flag-icons/flags/1x1/pl.svg',
    '/node_modules/flag-icons/flags/1x1/il.svg',
    '/node_modules/flag-icons/flags/1x1/ca.svg',
    '/node_modules/flag-icons/flags/1x1/mx.svg',
  ],
  { eager: true, query: '?url', import: 'default' },
) as Record<string, string>;

const FLAGS: Record<string, string> = Object.fromEntries(
  Object.entries(FLAG_FILES).map(([path, url]) => [path.split('/').pop()!.replace('.svg', ''), url]),
);

/** A group's round badge: its country flag, or an emoji for maps without flags. */
export function GroupMark({ group, className = '' }: { group: Group | null | undefined; className?: string }) {
  if (!group) return <span className={`inline-flag blank ${className}`} />;
  const url = group.flag ? FLAGS[group.flag] : undefined;
  if (url) return <span className={`inline-flag flagimg ${className}`} style={{ backgroundImage: `url("${url}")` }} />;
  return <span className={`inline-flag badge ${className}`}>{group.badge ?? group.name[0]}</span>;
}
