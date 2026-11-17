/** One line of text: every run of white space, line breaks included, becomes one space. */
export const oneLine = (s: string): string => s.replace(/\s+/g, ' ').trim();

/** Text that is safe inside a Markdown line or table cell: no markup, no line breaks. */
export const md = (s: string): string => oneLine(s).replace(/[\\`*_{}[\]<>|#]/g, (c) => `\\${c}`);
