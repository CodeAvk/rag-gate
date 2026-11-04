/** Shared tokenizer for retrieval and test-set checks: lowercase words, numbers kept, stopwords removed. */

export const STOPWORDS = new Set([
  "a", "about", "after", "again", "all", "an", "and", "any", "are", "as", "at", "be", "because", "been",
  "before", "being", "but", "by", "can", "could", "do", "does", "for", "from", "get", "had", "has", "have",
  "how", "i", "if", "in", "inside", "into", "is", "it", "its", "long", "many", "me", "much", "my", "needs",
  "of", "on", "one", "or", "our", "out", "so", "still", "than", "that", "the", "their", "them", "then",
  "there", "these", "this", "to", "until", "up", "very", "was", "we", "what", "when", "where", "which",
  "while", "who", "why", "will", "with", "within", "would", "you", "your",
]);

export function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((t) => !STOPWORDS.has(t));
}
