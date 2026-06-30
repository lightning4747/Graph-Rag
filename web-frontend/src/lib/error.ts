/**
 * Formats API errors and validation details into human-readable strings,
 * preventing React rendering crashes when errors contain objects or arrays.
 */
export function formatErrorDetail(detail: any): string {
  if (!detail) {
    return '';
  }
  
  if (typeof detail === 'string') {
    return detail;
  }
  
  if (Array.isArray(detail)) {
    return detail
      .map((err: any) => {
        if (err && typeof err === 'object') {
          // Extract field name from loc array (e.g. ["body", "birth_date"] -> "birth_date")
          const field = Array.isArray(err.loc)
            ? err.loc.filter((item: any) => item !== 'body').join('.')
            : '';
          const message = err.msg || 'Validation error';
          return field ? `${field}: ${message}` : message;
        }
        return String(err);
      })
      .join(', ');
  }
  
  if (typeof detail === 'object') {
    try {
      return detail.message || detail.error || JSON.stringify(detail);
    } catch {
      return '[Invalid Error Object]';
    }
  }
  
  return String(detail);
}
