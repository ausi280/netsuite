/**
 * Small fluent SuiteQL builder. NetSuite's REST SuiteQL endpoint has no bind
 * parameters, so callers pass pre-built literal conditions; this builder only
 * exists to keep query assembly (WHERE/ORDER BY/watermark clause) consistent
 * across entity services, not to sanitize arbitrary input.
 */
export class SuiteQlQueryBuilder {
  private columns: string[] = ['*'];
  private table = '';
  private conditions: string[] = [];
  private orderByColumn: string | null = null;
  private orderByDirection: 'ASC' | 'DESC' = 'ASC';
  // Set whenever whereWatermark() gets a tie-break id, so build() pages by
  // id instead — see whereWatermark() for why the timestamp can't be used.
  private useIdOrder = false;
  // Plain 'id' is ambiguous once `table` is a join (e.g. "inventorynumber n
  // JOIN item i ON n.item = i.id") — pass a qualified name (e.g. 'n.id') via
  // from()'s second argument in that case.
  private idColumn = 'id';

  static from(table: string, idColumn = 'id'): SuiteQlQueryBuilder {
    const builder = new SuiteQlQueryBuilder();
    builder.table = table;
    builder.idColumn = idColumn;
    return builder;
  }

  select(...columns: string[]): this {
    this.columns = columns.length ? columns : ['*'];
    return this;
  }

  where(rawCondition: string): this {
    this.conditions.push(rawCondition);
    return this;
  }

  /**
   * No-ops when watermark is null, i.e. the first-ever (full) sync.
   *
   * `tieBreakId` is for continuing past NetSuite's ~100k-row offset-
   * pagination ceiling within a single run. Some NetSuite custom-record
   * date fields render as text without a time component (e.g. "17/08/2026")
   * for a large fraction of rows — verified in production (2026-08-19) that
   * `customrecord1184` alone has 100k+ rows rendering this way for a single
   * calendar day. Critically, NetSuite's own WHERE/ORDER BY comparison still
   * uses the row's full-precision underlying value even when the *rendered*
   * text loses it: a client-reconstructed `lastmodified > x` bound built
   * from that lossy text matches essentially every such row regardless of
   * how many we've already fetched (verified: `id > 999999999` OR'd behind
   * `lastmodified > <collapsed value>` filtered nothing, while the same
   * `id` condition alone, AND'd, filtered correctly) — so continuing by
   * re-deriving a timestamp bound can never make forward progress once a
   * page like this is hit.
   *
   * `id` has no such rendering ambiguity, so once we can't trust the
   * timestamp for continuation, the watermark bound is pinned exactly where
   * the run started and pagination switches entirely to `id`, which is
   * guaranteed monotonic and lossless regardless of how record ids
   * correlate (or don't) with modification time.
   */
  whereWatermark(column: string, watermark: Date | null, tieBreakId?: string | number | null): this {
    if (watermark) {
      this.conditions.push(`${column} >= ${SuiteQlQueryBuilder.timestampLiteral(watermark)}`);
    }

    if (tieBreakId !== undefined && tieBreakId !== null) {
      this.conditions.push(`${this.idColumn} > ${SuiteQlQueryBuilder.idLiteral(tieBreakId)}`);
      this.useIdOrder = true;
    }

    return this;
  }

  orderBy(column: string, direction: 'ASC' | 'DESC' = 'ASC'): this {
    this.orderByColumn = column;
    this.orderByDirection = direction;
    return this;
  }

  build(): string {
    let query = `SELECT ${this.columns.join(', ')} FROM ${this.table}`;

    if (this.conditions.length > 0) {
      query += ` WHERE ${this.conditions.join(' AND ')}`;
    }

    const effectiveOrderColumn = this.useIdOrder ? this.idColumn : this.orderByColumn;
    if (effectiveOrderColumn) {
      query += ` ORDER BY ${effectiveOrderColumn} ${this.orderByDirection}`;
    }

    return query;
  }

  static timestampLiteral(date: Date): string {
    const isoNoMs = date.toISOString().slice(0, 19); // 'YYYY-MM-DDTHH:MI:SS'
    return `TO_TIMESTAMP('${isoNoMs}', 'YYYY-MM-DD"T"HH24:MI:SS')`;
  }

  static idLiteral(id: string | number): string {
    const value = String(id);
    return /^\d+$/.test(value) ? value : `'${value.replace(/'/g, "''")}'`;
  }
}
