const AppError = require("./AppError");

const ID_PATTERN = /^[0-9a-fA-F]{24}$/;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

// Query strings arrive as strings, but Express's parser can also produce arrays
// (?limit=1&limit=2) and objects (?cursor[$ne]=x). Anything that is not a plain
// string in the expected format is rejected before it can reach a database query.
function parsePagination(query) {
  const { limit, cursor } = query || {};

  let parsedLimit = DEFAULT_LIMIT;
  if (limit !== undefined) {
    if (typeof limit !== "string" || !/^\d{1,3}$/.test(limit))
      throw new AppError(`limit must be a whole number from 1 to ${MAX_LIMIT}`, 400);
    parsedLimit = Number(limit);
    if (parsedLimit < 1 || parsedLimit > MAX_LIMIT)
      throw new AppError(`limit must be a whole number from 1 to ${MAX_LIMIT}`, 400);
  }

  let parsedCursor = null;
  if (cursor !== undefined) {
    if (typeof cursor !== "string" || !ID_PATTERN.test(cursor))
      throw new AppError("cursor is not valid", 400);
    parsedCursor = cursor;
  }

  return { limit: parsedLimit, cursor: parsedCursor };
}

// Callers fetch limit + 1 rows. If the extra row arrived, there is another page, and
// the cursor is the id of the last row we are actually returning.
function buildPage(rows, limit, getCursorId) {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? String(getCursorId(items[items.length - 1])) : null;
  return { items, nextCursor };
}

module.exports = { parsePagination, buildPage };