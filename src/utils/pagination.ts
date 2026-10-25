const MAX_PAGE_SIZE = 100;

export function parsePagination(query, defaultPageSize = 25) {
  const page = Math.max(Number.parseInt(query.page, 10) || 1, 1);
  const pageSize = Math.min(Math.max(Number.parseInt(query.pageSize, 10) || defaultPageSize, 1), MAX_PAGE_SIZE);
  return { page, pageSize, offset: (page - 1) * pageSize, limit: pageSize };
}

/** Resolves ?sort=&order= against an allow-list of sortable columns. */
export function parseSort(query, allowed, fallback) {
  const column = allowed[query.sort] ? query.sort : fallback;
  const direction = String(query.order).toLowerCase() === "asc" ? "ASC" : "DESC";
  return { column, direction, expression: allowed[column] };
}

export function pagedResult(rows, total, { page, pageSize }) {
  return { data: rows, meta: { page, pageSize, total } };
}
