import vocabCsv from "@/data/vocab/vocab.csv";

/* ------------------------------------------------------------------ *
 * Vocab types
 * ------------------------------------------------------------------ */

export interface VocabWord {
  ja: string;
  romaji: string;
  en: string;
}

export interface VocabSet {
  id: string;
  label: string;
  words: VocabWord[];
}

/* ------------------------------------------------------------------ *
 * CSV parser (minimal — fields may be quoted, supports "" escapes)
 * ------------------------------------------------------------------ */

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\r") {
      // swallow
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

/* ------------------------------------------------------------------ *
 * Category display labels
 * ------------------------------------------------------------------ */

const CATEGORY_LABELS: Record<string, string> = {
  time: "Time",
  places: "Common Places",
};

/* ------------------------------------------------------------------ *
 * Load + group by category
 * ------------------------------------------------------------------ */

function loadVocabSets(csv: string): VocabSet[] {
  const table = parseCsv(csv);
  if (table.length < 2) return [];

  const header = table[0];
  const catIdx = header.indexOf("category");
  const jaIdx = header.indexOf("ja");
  const romajiIdx = header.indexOf("romaji");
  const enIdx = header.indexOf("en");

  const byCategory = new Map<string, VocabWord[]>();

  for (let r = 1; r < table.length; r++) {
    const cells = table[r];
    if (cells.length < header.length) continue;
    const get = (col: number) => (cells[col] ?? "").trim();
    const cat = get(catIdx);
    if (!cat) continue;

    const word: VocabWord = {
      ja: get(jaIdx),
      romaji: get(romajiIdx),
      en: get(enIdx),
    };

    const list = byCategory.get(cat);
    if (list) {
      list.push(word);
    } else {
      byCategory.set(cat, [word]);
    }
  }

  const sets: VocabSet[] = [];
  for (const [cat, words] of byCategory) {
    sets.push({
      id: cat,
      label: CATEGORY_LABELS[cat] ?? cat.charAt(0).toUpperCase() + cat.slice(1),
      words,
    });
  }
  return sets;
}

export const VOCAB_SETS: VocabSet[] = loadVocabSets(vocabCsv);
