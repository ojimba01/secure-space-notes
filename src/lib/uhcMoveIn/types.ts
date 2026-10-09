/** One line of UHC's checklist and the cells it is written to. */
export interface UhcLine {
  id: string;
  /** How it reads on screen. Empty for a blank line the case manager names. */
  label?: string;
  /** The item's cell: a note is written here after UHC's words, a typed item in place of them. */
  cell: string;
  qty?: string;
  total?: string;
  /** Clothing: the size column. */
  size?: string;
  /** The heading it sits under on UHC's sheet (Cheddar, Steak, Pasta …). */
  group?: string;
  /** Asks for a word or two: a flavor, a type, a property name. */
  note?: boolean;
  noteLabel?: string;
  /** UHC's own words in the item cell, which a note follows. */
  text?: string;
  /** A blank line for something not listed. */
  free?: boolean;
  multi?: boolean;
}

export interface UhcSection {
  title: string;
  lines: UhcLine[];
}

export interface UhcTab {
  id: string;
  title: string;
  /** The worksheet inside the .xlsx. */
  sheet: string;
  /** Where this tab's total goes on UHC's sheet. */
  totalCell: string;
  sections: UhcSection[];
}
