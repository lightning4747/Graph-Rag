'use client';

import styles from './RawFactsTable.module.css';

interface RawFactsTableProps {
  facts: Record<string, any>[];
}

export default function RawFactsTable({ facts }: RawFactsTableProps) {
  if (!facts || facts.length === 0) {
    return <div className={styles.emptyText}>No structured facts available.</div>;
  }

  // Get all unique keys across all facts to represent headers
  const headers = Array.from(
    new Set(facts.flatMap((fact) => Object.keys(fact)))
  );

  const renderValue = (val: any): string => {
    if (val === null || val === undefined) return '';
    if (typeof val === 'object') return JSON.stringify(val);
    return String(val);
  };

  // Humanize headers for display (e.g. generic_name -> Generic Name, base_dosage -> Base Dosage)
  const humanize = (str: string): string => {
    return str
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase());
  };

  return (
    <div className={styles.container}>
      <table className={styles.tableWrapper}>
        <thead>
          <tr>
            {headers.map((header) => (
              <th key={header} className={styles.tableHeader}>
                {humanize(header)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {facts.map((fact, idx) => (
            <tr key={idx} className={styles.tableRow}>
              {headers.map((header) => (
                <td key={header} className={styles.tableCell}>
                  {renderValue(fact[header])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
