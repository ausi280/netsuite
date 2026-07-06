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
  private orderByClause: string | null = null;

  static from(table: string): SuiteQlQueryBuilder {
    const builder = new SuiteQlQueryBuilder();
    builder.table = table;
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

  /** No-ops when watermark is null, i.e. the first-ever (full) sync. */
  whereWatermark(column: string, watermark: Date | null): this {
    if (watermark) {
      this.conditions.push(`${column} >= ${SuiteQlQueryBuilder.timestampLiteral(watermark)}`);
    }
    return this;
  }

  orderBy(column: string, direction: 'ASC' | 'DESC' = 'ASC'): this {
    this.orderByClause = `${column} ${direction}`;
    return this;
  }

  build(): string {
    let query = `SELECT ${this.columns.join(', ')} FROM ${this.table}`;
    if (this.conditions.length > 0) {
      query += ` WHERE ${this.conditions.join(' AND ')}`;
    }
    if (this.orderByClause) {
      query += ` ORDER BY ${this.orderByClause}`;
    }
    return query;
  }

  static timestampLiteral(date: Date): string {
    const isoNoMs = date.toISOString().slice(0, 19); // 'YYYY-MM-DDTHH:MI:SS'
    return `TO_TIMESTAMP('${isoNoMs}', 'YYYY-MM-DD"T"HH24:MI:SS')`;
  }
}
