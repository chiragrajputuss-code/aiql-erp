export function parseDbError(message: string): string {
  const colMatch = message.match(/column "(.+?)" does not exist/i);
  if (colMatch) return `Your GL doesn't have a "${colMatch[1]}" column. Try rephrasing to use available columns.`;

  if (/invalid input syntax for type date/i.test(message))
    return "Date format wasn't recognized. Try '1 April 2025' or '2025-04-01'.";

  if (/relation ".+?" does not exist/i.test(message))
    return "The data table wasn't found. The connection may need refreshing.";

  if (/operator does not exist/i.test(message))
    return "Type mismatch in the query. Try rephrasing your question.";

  if (/division by zero/i.test(message))
    return "Calculation resulted in division by zero. Check that the denominator column has values.";

  return "Query failed. Try rephrasing or ask a simpler version of your question.";
}
