// Shows a formatted support reply. Built from React elements only: the
// stored blocks are cleaned first, so no markup or odd colour gets through.
import React from 'react';
import { cleanRich, type RichBlock, type RichRun } from '@/lib/richText';

const Run: React.FC<{ run: RichRun }> = ({ run }) => {
  let node: React.ReactNode = run.text;
  if (run.italic) node = <em>{node}</em>;
  if (run.bold) node = <strong>{node}</strong>;
  return run.color ? <span style={{ color: run.color }}>{node}</span> : <>{node}</>;
};

const Line: React.FC<{ block: RichBlock }> = ({ block }) => (
  <>
    {block.runs.length ? block.runs.map((r, i) => <Run key={i} run={r} />) : '\u00a0'}
  </>
);

export const RichText: React.FC<{ value: unknown; className?: string }> = ({ value, className }) => {
  const blocks = cleanRich(value);
  // Consecutive bullet points share one list.
  const groups: { list: boolean; blocks: RichBlock[] }[] = [];
  for (const b of blocks) {
    const list = b.kind === 'li';
    const last = groups[groups.length - 1];
    if (last && last.list === list && list) last.blocks.push(b);
    else groups.push({ list, blocks: [b] });
  }
  return (
    <div className={`space-y-1 text-sm ${className ?? ''}`}>
      {groups.map((g, i) =>
        g.list ? (
          <ul key={i} className="list-disc space-y-0.5 pl-5">
            {g.blocks.map((b, j) => (
              <li key={j}>
                <Line block={b} />
              </li>
            ))}
          </ul>
        ) : (
          g.blocks.map((b, j) => (
            <p key={`${i}-${j}`} className="whitespace-pre-wrap">
              <Line block={b} />
            </p>
          ))
        ),
      )}
    </div>
  );
};
