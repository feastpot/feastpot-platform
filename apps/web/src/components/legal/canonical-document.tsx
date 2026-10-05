import { Fragment, type ReactNode } from 'react';

/** Render contract Markdown as text, never executable MDX or HTML. */
function inline(text: string): ReactNode {
  return text
    .split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g)
    .map((part, i) =>
      part.startsWith('**') && part.endsWith('**') ? (
        <strong key={i}>{part.slice(2, -2)}</strong>
      ) : part.startsWith('*') && part.endsWith('*') ? (
        <em key={i}>{part.slice(1, -1)}</em>
      ) : (
        <Fragment key={i}>{part}</Fragment>
      ),
    );
}

export function CanonicalDocument({ content }: { content: string }) {
  const lines = content.split('\n');
  const blocks: ReactNode[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (!line.trim()) continue;
    if (/^---+$/.test(line.trim())) {
      blocks.push(<hr key={i} className="my-4 border-cream-deep" />);
    } else if (/^\|/.test(line) && /^\|[\s:|-]+\|$/.test(lines[i + 1] ?? '')) {
      const cells = (row: string) =>
        row
          .split('|')
          .slice(1, -1)
          .map((s) => s.trim());
      const headers = cells(line);
      const rows: string[][] = [];
      const key = i;
      i += 2;
      while (i < lines.length && /^\|/.test(lines[i]!)) rows.push(cells(lines[i++]!));
      i--;
      blocks.push(
        <div
          key={key}
          className="max-w-full overflow-x-auto"
          tabIndex={0}
          role="region"
          aria-label={`${headers[0]} table`}
        >
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                {headers.map((cell, j) => (
                  <th key={j} scope="col" className="border-b border-cream-deep px-2 py-2">
                    {inline(cell)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, j) => (
                <tr key={j}>
                  {row.map((cell, k) => (
                    <td key={k} className="border-b border-cream-deep px-2 py-2 align-top">
                      {inline(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
    } else if (/^### /.test(line)) {
      blocks.push(
        <h3 key={i} className="mb-2 mt-4 font-bold">
          {inline(line.slice(4))}
        </h3>,
      );
    } else if (/^# /.test(line)) {
      blocks.push(
        <p key={i} className="font-bold">
          {inline(line.slice(2))}
        </p>,
      );
    } else if (/^[-*] /.test(line)) {
      const key = i;
      const items: string[] = [];
      while (i < lines.length && /^[-*] /.test(lines[i]!)) items.push(lines[i++]!.slice(2));
      i--;
      blocks.push(
        <ul key={key} className="my-2 list-disc pl-5">
          {items.map((item, j) => (
            <li key={j}>{inline(item)}</li>
          ))}
        </ul>,
      );
    } else {
      blocks.push(
        <p key={i} className="my-2">
          {inline(line)}
        </p>,
      );
    }
  }
  return <div className="min-w-0 max-w-full [overflow-wrap:anywhere]">{blocks}</div>;
}
